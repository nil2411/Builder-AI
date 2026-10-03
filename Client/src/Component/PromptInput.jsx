import { useEffect, useId, useRef, useState } from "react";
import { ArrowRightIcon, CloudUploadIcon, Loader2Icon, MicIcon, XIcon } from "lucide-react";

const MAX_ATTACHMENT_BYTES = 200 * 1024;
const TEXT_FILE_EXTENSIONS = /\.(?:txt|md|markdown|json|js|jsx|ts|tsx|css|scss|html|htm|csv|xml|yaml|yml)$/i;

function isTextFile(file) {
    return file.type.startsWith("text/") || file.type.includes("json") || TEXT_FILE_EXTENSIONS.test(file.name);
}

function appendText(existing, addition) {
    const text = addition.trim();
    if (!text) return existing;
    return existing.trim() ? `${existing.trim()} ${text}` : text;
}

const PromptInput = ({
    onSubmit,
    loading = false,
    placeholder = "Describe the website you want to build....",
    large = false,
    autoFocus = false,
    variant = "default",
}) => {
    const [value, setValue] = useState("");
    const [attachment, setAttachment] = useState(null);
    const [inputNotice, setInputNotice] = useState("");
    const [readingAttachment, setReadingAttachment] = useState(false);
    const [listening, setListening] = useState(false);
    const textareaRef = useRef(null);
    const recognitionRef = useRef(null);
    const fileInputId = `prompt-file-${useId().replace(/:/g, "")}`;

    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [autoFocus]);

    useEffect(() => {
        return () => {
            const recognition = recognitionRef.current;
            if (recognition) {
                recognition.onend = null;
                recognition.onerror = null;
                try {
                    recognition.stop();
                } catch {
                    // The recognition may already have stopped during unmount.
                }
            }
        };
    }, []);

    const handleFileChange = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file || loading) return;

        if (!isTextFile(file)) {
            setAttachment(null);
            setInputNotice("Please attach a text, code, JSON, Markdown, CSS, HTML, or CSV file.");
            return;
        }

        if (file.size > MAX_ATTACHMENT_BYTES) {
            setAttachment(null);
            setInputNotice("Attached files must be smaller than 200 KB.");
            return;
        }

        setReadingAttachment(true);
        setInputNotice("");
        try {
            const content = await file.text();
            if (!content.trim()) {
                setAttachment(null);
                setInputNotice("That file is empty.");
                return;
            }

            setAttachment({ name: file.name, content });
            setInputNotice(`${file.name} attached`);
        } catch (error) {
            console.error("Failed to read attachment:", error);
            setAttachment(null);
            setInputNotice("Could not read that file. Please try again.");
        } finally {
            setReadingAttachment(false);
        }
    };

    const handleVoiceInput = () => {
        if (loading || readingAttachment) return;

        if (listening) {
            recognitionRef.current?.stop();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setInputNotice("Voice input is not supported in this browser. Try Chrome or Edge.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = navigator.language || "en-US";

        recognition.onstart = () => {
            setListening(true);
            setInputNotice("Speak your request, then press the microphone again.");
        };

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .slice(event.resultIndex)
                .filter((result) => result.isFinal)
                .map((result) => result[0]?.transcript || "")
                .join(" ");

            if (transcript) setValue((previous) => appendText(previous, transcript));
        };

        recognition.onerror = (event) => {
            const message = event.error === "not-allowed"
                ? "Microphone permission was denied. Allow microphone access and try again."
                : `Voice input stopped: ${event.error || "unknown error"}.`;
            setInputNotice(message);
            setListening(false);
        };

        recognition.onend = () => {
            setListening(false);
            if (recognitionRef.current === recognition) recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (error) {
            console.error("Failed to start voice input:", error);
            recognitionRef.current = null;
            setListening(false);
            setInputNotice("Could not start voice input. Please try again.");
        }
    };

    const handleSubmit = (event) => {
        event?.preventDefault();
        const trimmed = value.trim();

        if ((!trimmed && !attachment) || loading || readingAttachment || listening) return;

        const prompt = attachment
            ? [
                trimmed,
                `Attached file: ${attachment.name}`,
                "```",
                attachment.content,
                "```",
            ].filter(Boolean).join("\n\n")
            : trimmed;

        onSubmit?.(prompt);
        setValue("");
        setAttachment(null);
        setInputNotice("");
    };

    const handleKeyDown = (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSubmit();
        }
    };

    const canSubmit = Boolean(value.trim() || attachment) && !loading && !readingAttachment && !listening;
    const uploadControl = (
        <label
            htmlFor={fileInputId}
            title="Attach a text or code file"
            className={`inline-flex items-center justify-center p-1.5 rounded-md cursor-pointer ${loading || readingAttachment ? "opacity-50 cursor-not-allowed" : ""}`}
        >
            <input
                id={fileInputId}
                type="file"
                accept=".txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.css,.scss,.html,.htm,.csv,.xml,.yaml,.yml,text/*,application/json"
                hidden
                disabled={loading || readingAttachment}
                onChange={handleFileChange}
            />
            {readingAttachment ? <Loader2Icon size={18} className="animate-spin" /> : <CloudUploadIcon size={18} />}
        </label>
    );

    const voiceControl = (
        <button
            type="button"
            title={listening ? "Stop voice input" : "Use voice input"}
            aria-label={listening ? "Stop voice input" : "Use voice input"}
            aria-pressed={listening}
            onClick={handleVoiceInput}
            disabled={loading || readingAttachment}
            className={`relative inline-flex items-center justify-center p-1.5 rounded-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${listening ? "text-red-500" : ""}`}
        >
            {listening && <span className="absolute inset-0 rounded-md border border-red-400/80 animate-ping" aria-hidden="true" />}
            {listening && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
            <MicIcon size={18} className="relative" />
        </button>
    );
    const listeningIndicator = listening && (
        <span className="inline-flex items-center gap-1.5 text-xs text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            Listening...
        </span>
    );
    const attachmentPreview = attachment && (
        <div className="flex items-center gap-2 text-xs rounded-md px-2 py-1 bg-black/10 max-w-full">
            <span className="truncate">{attachment.name}</span>
            <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => {
                    setAttachment(null);
                    setInputNotice("");
                }}
                className="shrink-0 rounded p-0.5 hover:bg-black/10 cursor-pointer"
            >
                <XIcon size={13} />
            </button>
        </div>
    );

    if (variant === "glass") {
        return (
            <form onSubmit={handleSubmit} className="max-w-2xl w-full bg-white/10 backdrop-blur-xl rounded-xl ring-1 ring-white/25 focus-within:ring-2 focus-within:ring-white/30 overflow-hidden transition">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={loading || listening}
                    rows={3}
                    className="w-full p-4 pb-2 resize-none placeholder:text-white/60 outline-none bg-transparent text-white text-base"
                />

                {(attachmentPreview || inputNotice) && (
                    <div className="px-3 pb-2 flex items-center gap-2 text-white/75" aria-live="polite">
                        {attachmentPreview}
                        {listeningIndicator}
                        {!attachment && !listening && inputNotice && <span className="text-xs">{inputNotice}</span>}
                    </div>
                )}

                <div className="flex items-center justify-between pb-3 px-3 gap-2">
                    <div className="flex items-center gap-1 border border-white/20 text-white/80 rounded-md">
                        {uploadControl}
                    </div>
                    <div className="flex items-center gap-1 text-white/80">
                        {voiceControl}
                        <button
                        type="submit"
                        disabled={!canSubmit}
                        className="flex items-center justify-center p-1 text-white/70 hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                            {loading ? <Loader2Icon size={18} className="animate-spin" /> : <ArrowRightIcon size={18} />}
                        </button>
                    </div>
                </div>
            </form>
        );
    }

    return (
        <form onSubmit={handleSubmit} className={`bg-white border border-zinc-400 rounded-xl focus-within:ring-1 focus-within:ring-zinc-300 transition ${large ? "p-4" : "p-3"}`}>
            {(attachmentPreview || inputNotice) && (
                <div className="mb-2 flex items-center gap-2 text-zinc-500" aria-live="polite">
                    {attachmentPreview}
                    {listeningIndicator}
                    {!attachment && !listening && inputNotice && <span className="text-xs">{inputNotice}</span>}
                </div>
            )}
            <div className="flex items-end gap-2">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={loading || listening}
                    rows={large ? 5 : 1}
                    className={`flex-1 bg-transparent border-none outline-none resize-none text-zinc-900 placeholder:text-zinc-400 ${large ? "text-base" : "text-sm"}`}
                />
                <div className="flex items-center gap-1 text-zinc-500">
                    {uploadControl}
                    {voiceControl}
                </div>
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="inline-flex items-center justify-center bg-zinc-950 text-white hover:bg-zinc-800 disabled:opacity-40 cursor-pointer rounded-full shrink-0"
                    style={{ width: large ? 36 : 24, height: large ? 36 : 24 }}
                >
                    {loading ? <Loader2Icon size={large ? 20 : 15} className="animate-spin" /> : <ArrowRightIcon size={large ? 20 : 15} />}
                </button>
            </div>
        </form>
    );
};

export default PromptInput;