"use client";

import type { CSSProperties } from "react";

type Props = {
  title?: string;
};

export default function NewBadge({ title = "Created in this session and not committed yet" }: Props) {
  return (
    <span style={badgeStyle} title={title}>
      new
    </span>
  );
}

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  height: 17,
  padding: "0 6px",
  borderRadius: 999,
  border: "1px solid rgba(45, 212, 191, 0.55)",
  background: "rgba(20, 184, 166, 0.16)",
  color: "#5eead4",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1,
  textTransform: "uppercase",
  letterSpacing: 0,
};
