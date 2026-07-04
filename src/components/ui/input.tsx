import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, onKeyDown, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onFocus={(e) => {
          if (type === "number") {
            // Defer so the click's mouseup doesn't clear the selection
            const el = e.currentTarget;
            setTimeout(() => el.select(), 0);
          }
          onFocus?.(e);
        }}
        onKeyDown={(e) => {
          if (
            type === "number" &&
            /^[1-9]$/.test(e.key) &&
            e.currentTarget.value.trim() !== "" &&
            Number(e.currentTarget.value) === 0
          ) {
            e.currentTarget.value = "";
          }
          onKeyDown?.(e);
        }}

        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
