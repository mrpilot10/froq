import { FROQ_LOGO_SRC } from "@/lib/brand";
import Image from "next/image";

interface FroqFooterProps {
  className?: string;
}

export function FroqFooter({ className }: FroqFooterProps) {
  return (
    <div className={className ? `footer froq-footer ${className}` : "footer froq-footer"}>
      <span>
        Powered by{" "}
        <a
          href="https://www.froq.io"
          target="_blank"
          rel="noreferrer"
          className="froq-footer-brand"
        >
          <Image
            src={FROQ_LOGO_SRC}
            alt=""
            width={14}
            height={14}
            className="froq-footer-logo"
          />
          <b>froq.io</b>
        </a>
      </span>
    </div>
  );
}
