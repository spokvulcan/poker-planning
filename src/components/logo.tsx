import Image from "next/image";
import Link from "next/link";

export const Logo = () => (
  <Link href="/" className="flex items-center group">
    <Image
      src="/logo.svg"
      alt="AgileKit - Free Planning Poker Tool"
      width={32}
      height={32}
      className="h-8 w-8 mr-2 transition-transform duration-300 group-hover:scale-105"
    />
    <span className="sr-only">Planning poker / Scrum Poker / AgileKit</span>
    <span className="text-xl font-bold text-foreground">
      AgileKit
    </span>
  </Link>
);
