import React, { ReactNode } from "react";

type ToolButtonProps = {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
};

export default function ToolButton({ active, onClick, title, children }: ToolButtonProps) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        padding: "6px 10px",
        borderRadius: 6,
        border: "none",
        background: active ? "#eff6ff" : "transparent",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
