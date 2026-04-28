export const statusConfig: Record<string, { container: string; dot: string }> = {
  PENDING: {
    container: `
      bg-amber-50 
      border-amber-200 
      text-amber-700 
      shadow-sm
    `,
    dot: "bg-amber-500",
  },
  APPROVED: {
    container: `
      bg-emerald-50 
      border-emerald-200 
      text-emerald-700 
      shadow-sm
    `,
    dot: "bg-emerald-500",
  },
  REJECTED: {
    container: `
      bg-red-50 
      border-red-200 
      text-red-700 
      shadow-sm
    `,
    dot: "bg-red-500",
  },
};