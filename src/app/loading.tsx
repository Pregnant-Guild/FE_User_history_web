export default function Loading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/40 backdrop-blur-sm dark:bg-black/40">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 dark:border-blue-900 dark:border-t-blue-500 rounded-full animate-spin"></div>
    </div>
  );
}
