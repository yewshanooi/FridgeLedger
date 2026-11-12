"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Receipt } from "./types";
import type { DuplicateMatch } from "./store";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiReceiptItem = {
  name: string;
  normalized_name?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price?: number | null;
  shelf_life_days?: number | null;
};

type ApiReceiptResult = {
  merchant?: string | null;
  purchase_date?: string | null;
  items: ApiReceiptItem[];
  message: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// ─── Context shape ───────────────────────────────────────────────────────────

interface ChatbotState {
  // File state
  selectedFile: File | null;
  previewUrl: string | null;

  // Scan result
  result: ApiReceiptResult | null;
  error: string | null;
  isLoading: boolean;
  saved: boolean;

  // Chat
  chatInput: string;
  chatMessages: ChatMessage[];
  chatError: string | null;
  isChatLoading: boolean;

  // Duplicate detection
  duplicates: DuplicateMatch[];
  showDuplicateWarning: boolean;
  pendingReceipt: Receipt | null;

  // Setters
  setSelectedFile: (file: File | null) => void;
  setPreviewUrl: (url: string | null) => void;
  setResult: (result: ApiReceiptResult | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setSaved: (saved: boolean) => void;
  setChatInput: (input: string) => void;
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setChatError: (error: string | null) => void;
  setIsChatLoading: (loading: boolean) => void;
  setDuplicates: (dupes: DuplicateMatch[]) => void;
  setShowDuplicateWarning: (show: boolean) => void;
  setPendingReceipt: (receipt: Receipt | null) => void;

  // Reset everything
  resetAll: () => void;
}

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Hi! Upload a receipt image and I'll extract all your grocery items. After scanning, ask me to re-check anything or get a summary.",
  },
];

const ChatbotContext = createContext<ChatbotState | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function ChatbotProvider({ children }: { children: ReactNode }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ApiReceiptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(DEFAULT_MESSAGES);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<Receipt | null>(null);

  const resetAll = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setIsLoading(false);
    setSaved(false);
    setChatInput("");
    setChatMessages(DEFAULT_MESSAGES);
    setChatError(null);
    setIsChatLoading(false);
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setPendingReceipt(null);
  }, [previewUrl]);

  return (
    <ChatbotContext.Provider
      value={{
        selectedFile,
        previewUrl,
        result,
        error,
        isLoading,
        saved,
        chatInput,
        chatMessages,
        chatError,
        isChatLoading,
        duplicates,
        showDuplicateWarning,
        pendingReceipt,
        setSelectedFile,
        setPreviewUrl,
        setResult,
        setError,
        setIsLoading,
        setSaved,
        setChatInput,
        setChatMessages,
        setChatError,
        setIsChatLoading,
        setDuplicates,
        setShowDuplicateWarning,
        setPendingReceipt,
        resetAll,
      }}
    >
      {children}
    </ChatbotContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useChatbot(): ChatbotState {
  const ctx = useContext(ChatbotContext);
  if (!ctx) {
    throw new Error("useChatbot must be used inside <ChatbotProvider>");
  }
  return ctx;
}
