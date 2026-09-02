import { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ThorxSpinnerProps = {
  size?: number;
} & Omit<HTMLAttributes<HTMLSpanElement>, "style"> & { style?: CSSProperties };

export default function ThorxSpinner({ size = 20, className, style, ...props }: ThorxSpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("thorx-loader shrink-0 align-middle", className)}
      style={{ "--size": `${size / 48}px`, ...style } as CSSProperties}
      {...props}
    />
  );
}
