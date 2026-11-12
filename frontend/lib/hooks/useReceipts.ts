import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Receipt, Reminder } from "../types";
import {
  getReceipts as fetchReceipts,
  getReminders as fetchReminders,
  markReceiptItemUsed as markUsed,
  markReceiptItemWasted as markWasted,
  restoreReceiptItem as restore,
  saveReminder,
  saveReceipt,
  updateReminder,
  deleteReminder,
} from "../store";
import { analyticsKeys } from "./useAnalytics";

// Query keys for cache management
export const receiptKeys = {
  all: ["receipts"] as const,
  reminders: ["reminders"] as const,
};

// ─── Receipts Hook ───────────────────────────────────────────────────────────

export function useReceipts() {
  return useQuery({
    queryKey: receiptKeys.all,
    queryFn: fetchReceipts,
  });
}

// ─── Reminders Hook ──────────────────────────────────────────────────────────

export function useReminders() {
  return useQuery({
    queryKey: receiptKeys.reminders,
    queryFn: fetchReminders,
  });
}

export function useSaveReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveReminder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.reminders });
    },
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Reminder> }) =>
      updateReminder(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.reminders });
    },
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteReminder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.reminders });
    },
  });
}

// ─── Receipt Item Status Mutations ───────────────────────────────────────────

export function useMarkItemUsed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markUsed,
    onMutate: async (itemId: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: receiptKeys.all });

      // Snapshot previous value
      const previousReceipts = queryClient.getQueryData<Receipt[]>(receiptKeys.all);

      // Optimistically update
      if (previousReceipts) {
        queryClient.setQueryData<Receipt[]>(receiptKeys.all, (old) =>
          old?.map((receipt) => ({
            ...receipt,
            items: receipt.items.map((item) =>
              item.id === itemId
                ? { ...item, status: "consumed" as const, used_at: new Date().toISOString() }
                : item
            ),
          }))
        );
      }

      return { previousReceipts };
    },
    onError: (_err, _itemId, context) => {
      // Rollback on error
      if (context?.previousReceipts) {
        queryClient.setQueryData(receiptKeys.all, context.previousReceipts);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      // Also invalidate analytics (affects waste insights)
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    },
  });
}

export function useMarkItemWasted() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markWasted,
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: receiptKeys.all });
      const previousReceipts = queryClient.getQueryData<Receipt[]>(receiptKeys.all);

      if (previousReceipts) {
        queryClient.setQueryData<Receipt[]>(receiptKeys.all, (old) =>
          old?.map((receipt) => ({
            ...receipt,
            items: receipt.items.map((item) =>
              item.id === itemId
                ? { ...item, status: "wasted" as const, used_at: new Date().toISOString() }
                : item
            ),
          }))
        );
      }

      return { previousReceipts };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousReceipts) {
        queryClient.setQueryData(receiptKeys.all, context.previousReceipts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      // Also invalidate analytics (affects waste insights)
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    },
  });
}

export function useRestoreItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: restore,
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: receiptKeys.all });
      const previousReceipts = queryClient.getQueryData<Receipt[]>(receiptKeys.all);

      if (previousReceipts) {
        queryClient.setQueryData<Receipt[]>(receiptKeys.all, (old) =>
          old?.map((receipt) => ({
            ...receipt,
            items: receipt.items.map((item) =>
              item.id === itemId
                ? { ...item, status: "active" as const, used_at: null }
                : item
            ),
          }))
        );
      }

      return { previousReceipts };
    },
    onError: (_err, _itemId, context) => {
      if (context?.previousReceipts) {
        queryClient.setQueryData(receiptKeys.all, context.previousReceipts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.all });
      // Also invalidate analytics (affects waste insights)
      queryClient.invalidateQueries({ queryKey: analyticsKeys.all });
    },
  });
}

// ─── Save Receipt Mutation ───────────────────────────────────────────────────

export function useSaveReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveReceipt,
    onSuccess: () => {
      // Invalidate and refetch receipts after saving
      queryClient.invalidateQueries({ 
        queryKey: receiptKeys.all,
        refetchType: 'active' // Refetch all active queries immediately
      });
      // Also invalidate analytics queries so Analytics page updates
      queryClient.invalidateQueries({
        queryKey: analyticsKeys.all,
        refetchType: 'active'
      });
    },
  });
}
