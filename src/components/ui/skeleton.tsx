import { cn } from "@/lib/utils"

/**
 * 骨架块基础组件:静态底色 + shimmer 扫光(见 index.css .shimmer)。
 * 底色用 secondary 的 60% 透明度,比实心更轻,和卡片底形成层次。
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("shimmer rounded-md bg-secondary", className)}
      {...props}
    />
  )
}

export { Skeleton }
