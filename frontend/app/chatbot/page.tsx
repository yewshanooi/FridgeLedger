"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Receipt } from "@/lib/types";
import {
  checkDuplicateReceipt,
  uploadReceiptImage,
} from "@/lib/store";
import { getAuthHeaders } from "@/lib/api";
import { useChatbot } from "@/lib/ChatbotContext";
import { useSaveReceipt } from "@/lib/hooks/useReceipts";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

function generateId(): string {
  return crypto.randomUUID();
}

export default function ChatbotPage() {
  const {
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
  } = useChatbot();

  const saveReceiptMutation = useSaveReceipt();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    // Revoke old preview URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setResult(null);
    setError(null);
    setSaved(false);
    setChatError(null);
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setPendingReceipt(null);
    setShowUploadOptions(false);
  }

  function handleUploadClick() {
    if (isMobile) {
      setShowUploadOptions(true);
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleCameraCapture() {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("capture", "environment");
      fileInputRef.current.click();
      fileInputRef.current.removeAttribute("capture");
    }
    setShowUploadOptions(false);
  }

  function handleGallerySelect() {
    if (fileInputRef.current) {
      fileInputRef.current.removeAttribute("capture");
      fileInputRef.current.click();
    }
    setShowUploadOptions(false);
  }

  /** Upload image + save receipt to Supabase */
  async function persistReceipt(receipt: Receipt) {
    // Upload image to Supabase Storage
    if (selectedFile) {
      try {
        const imagePath = await uploadReceiptImage(receipt.id, selectedFile);
        receipt.imagePath = imagePath;
      } catch {
        // Non-fatal: save receipt without image if upload fails
        console.warn("Image upload failed, saving receipt without image.");
      }
    }

    await saveReceiptMutation.mutateAsync(receipt);
    setSaved(true);
    setPendingReceipt(null);
    setShowDuplicateWarning(false);

    // Fire-and-forget: send immediate email if any item expires within 7 days
    fetch(`${apiBaseUrl}/receipts/${receipt.id}/notify-expiry`, {
      method: "POST",
      headers: await getAuthHeaders(),
    }).catch(() => {});

    setChatMessages((msgs) => [
      ...msgs,
      {
        role: "assistant",
        content: `✓ Saved! ${receipt.items.length} item(s) from ${receipt.merchant} have been added to your pantry.`,
      },
    ]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Please upload a receipt image first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setDuplicates([]);
    setShowDuplicateWarning(false);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${apiBaseUrl}/receipts/scan`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Receipt parsing failed.");

      setResult(data);

      const merchant = data.merchant ?? "Unknown";
      const purchaseDate =
        data.purchase_date ?? new Date().toISOString().split("T")[0];

      const receipt: Receipt = {
        id: generateId(),
        merchant,
        purchaseDate,
        items: data.items,
        savedAt: new Date().toISOString(),
      };

      setChatMessages((msgs) => [
        ...msgs,
        {
          role: "assistant",
          content: `Done! I found ${data.items.length} item(s) from ${merchant}. Checking for duplicates...`,
        },
      ]);

      // Check for duplicates before saving
      const dupes = await checkDuplicateReceipt(merchant, purchaseDate);

      if (dupes.length > 0) {
        setDuplicates(dupes);
        setShowDuplicateWarning(true);
        setPendingReceipt(receipt);
        setChatMessages((msgs) => [
          ...msgs,
          {
            role: "assistant",
            content: `⚠️ I found ${dupes.length} existing receipt(s) from "${merchant}" on the same date. Please confirm below whether you'd like to save this or skip it.`,
          },
        ]);
      } else {
        // No duplicates — let user review and correct before saving
        setPendingReceipt(receipt);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveAnyway() {
    if (!pendingReceipt || !result) return;
    setIsLoading(true);
    try {
      const correctedReceipt: Receipt = {
        ...pendingReceipt,
        merchant: result.merchant ?? pendingReceipt.merchant,
        purchaseDate: result.purchase_date ?? pendingReceipt.purchaseDate,
        items: result.items,
      };
      await persistReceipt(correctedReceipt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkipDuplicate() {
    setShowDuplicateWarning(false);
    setPendingReceipt(null);
    setChatMessages((msgs) => [
      ...msgs,
      {
        role: "assistant",
        content:
          "Got it — skipped saving this receipt. Upload a different receipt to continue.",
      },
    ]);
  }

  function handleClearAll() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
    setSaved(false);
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setPendingReceipt(null);
  }

  async function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;

    if (!selectedFile) {
      setChatError("Upload a receipt image before asking the assistant.");
      return;
    }

    setIsChatLoading(true);
    setChatError(null);
    setChatInput("");
    setChatMessages((msgs) => [...msgs, { role: "user", content: message }]);

    const formData = new FormData();
    formData.append("message", message);
    formData.append("file", selectedFile);
    if (result) formData.append("current_result", JSON.stringify(result));

    try {
      const response = await fetch(`${apiBaseUrl}/receipts/chat`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Assistant request failed.");

      setChatMessages((msgs) => [
        ...msgs,
        {
          role: "assistant",
          content: data.reply ?? "I reviewed the receipt.",
        },
      ]);

      if (data.corrected_receipt) setResult(data.corrected_receipt);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setIsChatLoading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          AI Receipt Scanner
        </p>
        <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">
          Receipt Upload
        </h2>
        <p className="mt-2 text-sm text-[#526056]">
          Upload a grocery receipt image — AI will extract items, prices, and
          shelf-life estimates automatically.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: Upload + Result */}
        <div className="space-y-5">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#526056]">
              Receipt image
            </p>

            <div
              onClick={previewUrl ? undefined : handleUploadClick}
              className={`flex min-h-40 max-h-[50vh] sm:max-h-96 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#c9c0b3] bg-[#fbfaf7] p-4 text-center transition overflow-hidden ${previewUrl
                ? ""
                : "cursor-pointer hover:border-emerald-600 hover:bg-[#f8f3e9]"
                }`}
            >
              {previewUrl ? (
                <Image
                  src={previewUrl}
                  alt="Receipt preview"
                  width={600}
                  height={800}
                  unoptimized
                  className="h-auto max-h-[45vh] w-full rounded-md object-contain sm:max-h-80"
                />
              ) : (
                <div>
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#059669"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <p className="font-semibold text-[#1f2a24]">
                    Upload receipt
                  </p>
                  <p className="mt-1 text-xs text-[#6a756d]">
                    {isMobile ? "Tap to choose" : "PNG, JPG, or JPEG"}
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                id="receipt-image"
                type="file"
                accept="image/png, image/jpeg"
                onChange={handleFileChange}
                className="sr-only"
              />
            </div>

            {/* Mobile Upload Options Modal */}
            {showUploadOptions && isMobile && (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white pb-6 shadow-xl animate-slide-up">
                  <div className="mb-4 flex items-center justify-between border-b border-[#e7e1d7] px-5 py-4">
                    <h3 className="text-lg font-semibold text-[#1f2a24]">
                      Upload Receipt
                    </h3>
                    <button
                      onClick={() => setShowUploadOptions(false)}
                      className="text-[#526056] hover:text-[#1f2a24]"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-3 px-5">
                    <button
                      onClick={handleCameraCapture}
                      className="flex w-full items-center gap-4 rounded-xl border border-[#d7d0c3] bg-white p-4 text-left transition hover:border-emerald-600 hover:bg-emerald-50"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#059669"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                          <circle cx="12" cy="13" r="4" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-[#1f2a24]">
                          Take Photo
                        </p>
                        <p className="text-sm text-[#6a756d]">
                          Capture receipt with camera
                        </p>
                      </div>
                    </button>

                    <button
                      onClick={handleGallerySelect}
                      className="flex w-full items-center gap-4 rounded-xl border border-[#d7d0c3] bg-white p-4 text-left transition hover:border-blue-600 hover:bg-blue-50"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-[#1f2a24]">
                          Choose from Gallery
                        </p>
                        <p className="text-sm text-[#6a756d]">
                          Select from photo album
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex w-full items-center gap-3">
              <p className="w-0 flex-1 truncate text-sm text-[#6a756d]" title={selectedFile?.name}>
                {selectedFile ? selectedFile.name : "No file selected"}
              </p>
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="shrink-0 rounded border border-[#d7d0c3] px-2 py-1 text-xs text-[#526056] hover:text-red-600 transition"
                >
                  Remove
                </button>
              )}
            </div>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !selectedFile}
              className="mt-3 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
            >
              {isLoading ? "Scanning receipt..." : "Scan receipt"}
            </button>
          </form>

          {/* Duplicate warning banner */}
          {showDuplicateWarning && duplicates.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
              <div className="mb-3 flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d97706"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-900">
                    Duplicate receipt detected
                  </h4>
                  <p className="mt-1 text-sm text-amber-800">
                    A receipt from{" "}
                    <span className="font-semibold">
                      {duplicates[0].merchant}
                    </span>{" "}
                    on{" "}
                    <span className="font-semibold">
                      {new Date(duplicates[0].purchaseDate).toLocaleDateString(
                        "en-MY",
                        { day: "numeric", month: "long", year: "numeric" }
                      )}
                    </span>{" "}
                    with {duplicates[0].itemCount} item(s) already exists in your
                    pantry.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveAnyway}
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={handleSkipDuplicate}
                  className="flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
              {saved && (
                <div className="mb-4 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5">
                  <span className="text-sm font-medium text-emerald-800">
                    ✓ Saved to your pantry
                  </span>
                  <Link
                    href="/dashboard"
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    View Dashboard →
                  </Link>
                </div>
              )}

              {pendingReceipt && !saved && !showDuplicateWarning && (
                <button
                  type="button"
                  onClick={handleSaveAnyway}
                  disabled={isLoading}
                  className="mb-4 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
                >
                  {isLoading ? "Saving..." : "Save to Pantry"}
                </button>
              )}

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-[#f7f4ee] p-3">
                  <p className="text-xs text-[#6a756d]">Merchant</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f2a24]">
                    {result.merchant ?? "Unknown"}
                  </p>
                </div>
                <div className="rounded-md bg-[#f7f4ee] p-3">
                  <p className="text-xs text-[#6a756d]">Purchase date</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1f2a24]">
                    {result.purchase_date ?? "Unknown"}
                  </p>
                </div>
              </div>

              {result.items.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[#e7e1d7]">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#f7f4ee] text-[#526056]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Item</th>
                        <th className="px-3 py-2.5 font-semibold">Qty</th>
                        <th className="px-3 py-2.5 font-semibold">Price</th>
                        <th className="px-3 py-2.5 font-semibold">Shelf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item, i) => (
                        <tr key={i} className="border-t border-[#e7e1d7]">
                          <td className="px-3 py-2 font-medium">{item.name}</td>
                          <td className="px-3 py-2 text-[#526056]">
                            {item.quantity ?? "-"} {item.unit ?? ""}
                          </td>
                          <td className="px-3 py-2">
                            {item.price == null ? "-" : `RM ${item.price}`}
                          </td>
                          <td className="px-3 py-2">
                            {item.shelf_life_days == null
                              ? "-"
                              : `${item.shelf_life_days}d`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-md border border-[#e7e1d7] bg-[#fbfaf7] p-4 text-sm text-[#6a756d]">
                  No items detected. Try a clearer image.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: Chat */}
        <div className="flex h-[60vh] flex-col rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm lg:h-[calc(100vh-10rem)]">
          <div className="mb-4 border-b border-[#e7e1d7] pb-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#526056]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#007a55"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9.94 14.06L8 19l-1.94-4.94L1 12.12l5.06-1.94L8 5.24l1.94 4.94L15 12.12l-5.06 1.94z" />
                <path d="M17 4l.94 2.06L20 7l-2.06.94L17 10l-.94-2.06L14 7l2.06-.94L17 4z" />
                <path d="M19 14l.6 1.4 1.4.6-1.4.6L19 18l-.6-1.4L17 16l1.4-.6L19 14z" />
              </svg>
              AI Assistant
            </p>
            <h3 className="text-lg font-semibold text-[#1f2a24]">
              Ask about your receipt
            </h3>
          </div>

          <div className="mb-4 flex-1 space-y-3 overflow-y-auto pr-1">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-6 ${msg.role === "user"
                  ? "ml-auto bg-emerald-700 text-white"
                  : "mr-auto border border-[#e7e1d7] bg-[#f7f4ee] text-[#1f2a24]"
                  }`}
              >
                {msg.content}
              </div>
            ))}
            {isChatLoading && (
              <div className="mr-auto max-w-[85%] rounded-xl border border-[#e7e1d7] bg-[#f7f4ee] px-4 py-2.5 text-sm text-[#6a756d]">
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {chatError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {chatError}
            </div>
          )}

          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about the receipt..."
              className="flex-1 rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={isChatLoading || !chatInput.trim()}
              className="rounded-lg bg-[#1f2a24] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2d3a32] disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
