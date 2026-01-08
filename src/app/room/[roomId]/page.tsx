"use client"

import { ChatInput } from "@/components/chat-input"
import { useUsername } from "@/hooks/use-username"
import { client } from "@/lib/client"
import { useRealtime } from "@/lib/realtime-client"
import { Message } from "@/lib/realtime"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useCallback } from "react"

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

// Get initials from username for avatar
function getInitials(name: string): string {
  const parts = name.split("-")
  if (parts.length >= 2) {
    return (parts[1]?.[0] || "A").toUpperCase()
  }
  return name[0]?.toUpperCase() || "?"
}

const Page = () => {
  const params = useParams()
  const roomId = params.roomId as string
  const router = useRouter()
  const queryClient = useQueryClient()

  const { username } = useUsername()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [copyStatus, setCopyStatus] = useState("COPY")
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZED: TTL Query - fetch once, never refetch
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: ttlData } = useQuery({
    queryKey: ["ttl", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({ query: { roomId } })
      return res.data
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  useEffect(() => {
    if (ttlData?.ttl !== undefined) setTimeRemaining(ttlData.ttl)
  }, [ttlData])

  useEffect(() => {
    if (timeRemaining === null || timeRemaining < 0) return

    if (timeRemaining === 0) {
      router.push("/?destroyed=true")
      return
    }

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [timeRemaining, router])

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZED: Messages Query - stale forever, we use realtime
  // ═══════════════════════════════════════════════════════════════════════════
  const { data: messages } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } })
      return res.data
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZED: Send message mutation with OPTIMISTIC UPDATES
  // ═══════════════════════════════════════════════════════════════════════════
  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({ text, imageBase64, imageType, id }: {
      text: string
      imageBase64?: string
      imageType?: string
      id: string
    }) => {
      await client.messages.post(
        { id, sender: username, text, imageBase64, imageType },
        { query: { roomId } }
      )
    },
    onMutate: async (newMessage) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["messages", roomId] })

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(["messages", roomId])

      // Optimistically update to the new value
      queryClient.setQueryData(
        ["messages", roomId],
        (old: { messages: Message[] } | undefined) => {
          const optimisticMessage: Message = {
            id: newMessage.id,
            sender: username,
            text: newMessage.text,
            timestamp: Date.now(),
            roomId,
            imageBase64: newMessage.imageBase64,
            imageType: newMessage.imageType,
          }

          if (!old) return { messages: [optimisticMessage] }
          return {
            messages: [...old.messages, optimisticMessage],
          }
        }
      )

      // Return a context object with the snapshotted value
      return { previousMessages }
    },
    onError: (err, newTodo, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", roomId], context.previousMessages)
      }
    },
    onSuccess: () => {
      // Force a refetch to ensure we're perfectly in sync with the server
      queryClient.invalidateQueries({ queryKey: ["messages", roomId] })
    },
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIMIZED: Realtime - append to cache instead of refetching
  // ═══════════════════════════════════════════════════════════════════════════
  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy"],
    onData: ({ event, data }) => {
      if (event === "chat.message") {
        // OPTIMIZATION: Append new message directly to cache
        queryClient.setQueryData(
          ["messages", roomId],
          (old: { messages: Message[] } | undefined) => {
            if (!old) return { messages: [data as Message] }

            // Avoid duplicates
            const exists = old.messages.some((m) => m.id === (data as Message).id)
            if (exists) return old

            return {
              messages: [...old.messages, data as Message],
            }
          }
        )
      }

      if (event === "chat.destroy") {
        router.push("/?destroyed=true")
      }
    },
  })

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const { mutate: destroyRoom } = useMutation({
    mutationFn: async () => {
      await client.room.delete(null, { query: { roomId } })
    },
  })

  const copyLink = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setCopyStatus("COPIED!")
    setTimeout(() => setCopyStatus("COPY"), 2000)
  }

  return (
    <main className="flex flex-col h-screen max-h-screen overflow-hidden bg-gradient-animated">
      {/* ═══════════════════════════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="header-gradient p-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Room ID */}
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Room ID
            </span>
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400 font-mono text-sm">
                {roomId.slice(0, 8)}...
              </span>
              <button
                onClick={copyLink}
                className="text-[10px] glass px-2 py-0.5 rounded-md text-zinc-400 hover:text-white transition-all hover:border-emerald-500/50"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800/50" />

          {/* Timer */}
          <div className="flex flex-col">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
              Self-Destruct
            </span>
            <span
              className={`text-sm font-bold font-mono flex items-center gap-2 ${timeRemaining !== null && timeRemaining < 60
                ? "text-red-500 timer-warning"
                : "text-amber-400"
                }`}
            >
              ⏱ {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : "--:--"}
            </span>
          </div>
        </div>

        {/* Destroy Button */}
        <button
          onClick={() => destroyRoom()}
          className="btn-danger flex items-center gap-2 text-xs"
        >
          <span className="group-hover:animate-pulse">💣</span>
          DESTROY NOW
        </button>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          MESSAGES AREA
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
        {messages?.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
              <span className="text-4xl">💬</span>
            </div>
            <div className="text-center">
              <p className="text-zinc-400 text-sm font-medium">No messages yet</p>
              <p className="text-zinc-600 text-xs mt-1">Start the conversation...</p>
            </div>
          </div>
        )}

        {messages?.messages.map((msg) => {
          const isUser = msg.sender === username
          return (
            <div
              key={msg.id}
              className={`flex items-end gap-3 ${isUser ? "justify-start" : "justify-end"}`}
            >
              {/* User Avatar (left side) */}
              {isUser && (
                <div className="avatar avatar-user">
                  {getInitials(msg.sender)}
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-[70%] p-4 ${isUser ? "message-user" : "message-other"
                  }`}
              >
                {/* Sender & Time */}
                <div className={`flex items-center gap-2 mb-2 ${isUser ? "" : "justify-end"}`}>
                  <span
                    className={`text-xs font-semibold ${isUser ? "text-emerald-400" : "text-sky-400"
                      }`}
                  >
                    {isUser ? "YOU" : msg.sender.split("-").slice(0, 2).join("-")}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {format(msg.timestamp, "HH:mm")}
                  </span>
                </div>

                {/* Message Content */}
                {msg.imageBase64 && (
                  <div className="mb-2 rounded-lg overflow-hidden">
                    <img
                      src={`data:${msg.imageType};base64,${msg.imageBase64}`}
                      alt="Shared image"
                      className="max-w-full max-h-[300px] object-contain rounded-lg"
                    />
                  </div>
                )}

                {msg.text && msg.text !== "📷" && (
                  <p className="text-sm text-zinc-200 leading-relaxed break-words">
                    {msg.text}
                  </p>
                )}
              </div>

              {/* Other Avatar (right side) */}
              {!isUser && (
                <div className="avatar avatar-other">
                  {getInitials(msg.sender)}
                </div>
              )}
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          CHAT INPUT
          ═══════════════════════════════════════════════════════════════════════ */}
      <ChatInput
        onSend={(text, image) => {
          sendMessage({
            id: crypto.randomUUID(), // Client-side ID for optimistic update
            text: text || (image ? "📷" : ""),
            imageBase64: image?.base64,
            imageType: image?.type,
          })
        }}
        isPending={isPending}
      />
    </main>
  )
}

export default Page
