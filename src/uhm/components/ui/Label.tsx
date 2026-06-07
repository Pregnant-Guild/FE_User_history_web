import type { LabelHTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  children: ReactNode;
};

export default function Label({ children, className, ...props }: LabelProps) {
  return (
    <label
      className={twMerge(
        "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
