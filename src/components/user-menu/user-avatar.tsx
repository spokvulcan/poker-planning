"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { getColorFromName, getInitial } from "@/lib/avatar-utils";

const sizeClasses = {
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-10 text-base",
};

const sizePixels = {
  sm: 24,
  md: 32,
  lg: 40,
};

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserAvatar({ name, avatarUrl, size = "md", className }: UserAvatarProps) {
  const initial = getInitial(name);
  const bgColor = getColorFromName(name);

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={sizePixels[size]}
        height={sizePixels[size]}
        // A muted circle until the photo loads, so it fills in rather than pops in
        className={cn(
          "rounded-full bg-muted object-cover",
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full font-medium text-white",
        sizeClasses[size],
        bgColor,
        className
      )}
    >
      {initial}
    </div>
  );
}
