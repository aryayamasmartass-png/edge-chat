"use client"

import { useRef, useState, useCallback, useEffect } from "react"

interface ChatInputProps {
    onSend: (text: string, image?: { base64: string; type: string }) => void
    isPending: boolean
}

export function ChatInput({ onSend, isPending }: ChatInputProps) {
    const [input, setInput] = useState("")
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [imageData, setImageData] = useState<{ base64: string; type: string } | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleImageSelect = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) return

        setIsUploading(true)
        try {
            const previewUrl = URL.createObjectURL(file)
            setImagePreview(previewUrl)

            // Simple compression logic (moved from page.tsx for simplicity in this component)
            const reader = new FileReader()
            reader.onload = (e) => {
                const img = new Image()
                img.onload = () => {
                    const canvas = document.createElement("canvas")
                    let { width, height } = img
                    const maxDim = 1200
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = (height / width) * maxDim
                            width = maxDim
                        } else {
                            width = (width / height) * maxDim
                            height = maxDim
                        }
                    }
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext("2d")!
                    ctx.drawImage(img, 0, 0, width, height)
                    const base64 = canvas.toDataURL("image/jpeg", 0.8)

                    setImageData({
                        base64: base64.split(",")[1],
                        type: "image/jpeg",
                    })
                    setIsUploading(false)
                }
                img.src = e.target?.result as string
            }
            reader.readAsDataURL(file)
        } catch (error) {
            console.error("Failed to process image", error)
            setIsUploading(false)
        }
    }, [])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) handleImageSelect(file)
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [])

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items
            if (!items) return
            for (const item of items) {
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile()
                    if (file) handleImageSelect(file)
                    break
                }
            }
        }
        document.addEventListener("paste", handlePaste)
        return () => document.removeEventListener("paste", handlePaste)
    }, [handleImageSelect])

    const removeImage = () => {
        setImagePreview(null)
        setImageData(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleSend = () => {
        if (!input.trim() && !imageData) return
        onSend(input, imageData || undefined)
        setInput("")
        removeImage()
        // Keep focus
        setTimeout(() => inputRef.current?.focus(), 10)
    }

    return (
        <div className="w-full max-w-3xl mx-auto px-4 pb-6">
            <div className="relative group perspective-1000">
                {/* Animated Glow Backdrop */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-purple-500/30 rounded-2xl opacity-75 blur-lg group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>

                <div className="relative bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5">

                    {/* Image Preview Area */}
                    {imagePreview && (
                        <div className="p-4 pb-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="relative inline-flex group/image">
                                <img
                                    src={imagePreview}
                                    className="h-24 rounded-lg border border-white/10 shadow-lg object-cover"
                                    alt="Preview"
                                />
                                <button
                                    onClick={removeImage}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover/image:opacity-100 transition-opacity scale-90 hover:scale-110"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                </button>
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Main Input Bar */}
                    <div className="flex items-center gap-3 p-4">
                        {/* Command Icon / Upload Trigger */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-all duration-300 group/icon"
                        >
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="group-hover/icon:scale-110 transition-transform"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                        </button>

                        {/* Input Field */}
                        <div className="flex-1 relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                autoFocus
                                placeholder="Type your message..."
                                className="w-full bg-transparent text-zinc-100 text-lg placeholder:text-zinc-600 focus:outline-none font-medium leading-relaxed tracking-wide"
                            />
                        </div>

                        {/* Send Button */}
                        <button
                            onClick={handleSend}
                            disabled={(!input.trim() && !imageData) || isPending}
                            className="flex-shrink-0 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-lg text-sm transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
                        >
                            <span>Send</span>
                            <span className="text-xs bg-black/10 px-1.5 py-0.5 rounded text-black/70 font-mono">↵</span>
                        </button>
                    </div>

                    {/* Footer / Shortcuts */}
                    <div className="px-4 py-2 bg-white/[0.02] border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500 font-medium">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5"><kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-sans">⌘ K</kbd> Focus</span>
                            <span className="flex items-center gap-1.5"><kbd className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-sans">^ V</kbd> Paste image</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-500/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Encrypted
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
