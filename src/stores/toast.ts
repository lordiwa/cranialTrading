import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastType = 'success' | 'error' | 'info' | 'progress';

interface BaseToast {
    id: number;
    message: string;
    type: ToastType;
}

interface ProgressToast extends BaseToast {
    type: 'progress';
    progress: number; // 0-100
    status: 'active' | 'complete' | 'error';
}

export type Toast = BaseToast | ProgressToast;

export const isProgressToast = (toast: Toast): toast is ProgressToast => {
    return toast.type === 'progress';
};

export const useToastStore = defineStore('toast', () => {
    const toasts = ref<Toast[]>([]);
    let nextId = 0;

    /**
     * Show a regular toast notification
     */
    const show = (message: string, type: ToastType = 'info', persistent: boolean = false): number => {
        const id = nextId++;
        toasts.value.push({ id, message, type });

        if (!persistent && type !== 'progress') {
            setTimeout(() => {
                remove(id);
            }, 4000);
        }

        return id;
    };

    /**
     * Show a progress toast with a progress bar
     * Returns an object with methods to update/complete the progress
     */
    const showProgress = (message: string, initialProgress: number = 0) => {
        const id = nextId++;
        const progressToast: ProgressToast = {
            id,
            message,
            type: 'progress',
            progress: initialProgress,
            status: 'active'
        };
        toasts.value.push(progressToast);

        return {
            id,
            /**
             * Update progress (0-100) and optionally the message
             */
            update: (progress: number, newMessage?: string) => {
                const toast = toasts.value.find(t => t.id === id);
                if (toast && isProgressToast(toast)) {
                    toast.progress = Math.min(100, Math.max(0, progress));
                    if (newMessage) toast.message = newMessage;
                }
            },
            /**
             * Mark as complete and auto-remove after delay
             */
            complete: (successMessage?: string) => {
                const toast = toasts.value.find(t => t.id === id);
                if (toast && isProgressToast(toast)) {
                    toast.progress = 100;
                    toast.status = 'complete';
                    if (successMessage) toast.message = successMessage;
                    setTimeout(() => remove(id), 2000);
                }
            },
            /**
             * Mark as error and auto-remove after delay
             */
            error: (errorMessage?: string) => {
                const toast = toasts.value.find(t => t.id === id);
                if (toast && isProgressToast(toast)) {
                    toast.status = 'error';
                    if (errorMessage) toast.message = errorMessage;
                    setTimeout(() => remove(id), 4000);
                }
            },
            /**
             * Remove immediately
             */
            dismiss: () => remove(id)
        };
    };

    const remove = (id: number) => {
        const index = toasts.value.findIndex(t => t.id === id);
        if (index > -1) {
            toasts.value.splice(index, 1);
        }
    };

    return {
        toasts,
        show,
        showProgress,
        remove,
    };
});
