import Image from "next/image";

interface FroqFooterProps {
  className?: string;
}

export function FroqFooter({ className }: FroqFooterProps) {
  return (
    <div className={className ? `footer froq-footer ${className}` : "footer froq-footer"}>
      <span>
        Powered by{" "}
        <span className="froq-footer-brand">
          <Image
            src="/froq-logo.png"
            alt="Froq"
            width={14}
            height={14}
            className="froq-footer-logo"
          />
          <b>froq.io</b>
        </span>
      </span>
    </div>
  );
}
