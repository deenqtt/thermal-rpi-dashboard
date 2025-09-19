// File: hooks/use-toast.ts
import { useState } from "react";

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = ({
    title,
    description,
    variant = "default",
  }: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);

    const newToast: ToastMessage = {
      id,
      title,
      description,
      variant,
    };

    setToasts((prev) => [...prev, newToast]);

    // Simple console log for now (bisa diganti dengan toast library)
    if (variant === "destructive") {
      console.error("❌", title, description);
    } else {
      console.log("✅", title, description);
    }

    // Auto remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return {
    toast,
    toasts,
    dismiss,
  };
}
