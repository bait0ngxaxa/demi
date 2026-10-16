import { toast } from "sonner";

/** Use short, pre-approved Thai summaries; keep user data and recovery detail inline. */
export const notify = {
  success(message: string): void {
    toast.success(message, { duration: 3500 });
  },
  error(message: string): void {
    toast.error(message, { duration: 5500 });
  },
  warning(message: string): void {
    toast.warning(message, { duration: 5000 });
  },
  info(message: string): void {
    toast.info(message, { duration: 4000 });
  },
};
