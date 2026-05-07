"use client";

import { useState, useRef } from "react";
import { D, formatTHB, parseTHB, Decimal } from "@wind-acc/shared";
import { cn } from "@/lib/utils";

interface MoneyInputProps {
  value: string;
  onChange: (raw: string, decimal: Decimal) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

export function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  disabled = false,
  className,
  id,
  name,
}: MoneyInputProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw numeric value when editing
    const parsed = parseTHB(displayValue);
    if (parsed.isZero()) {
      setDisplayValue("");
    } else {
      setDisplayValue(parsed.abs().toFixed(2));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!displayValue.trim()) {
      setDisplayValue("0.00");
      onChange("0.00", D(0));
      return;
    }
    try {
      const d = D(displayValue.replace(/,/g, ""));
      const formatted = formatTHB(d);
      const display = d.isZero() ? "0.00" : formatted;
      setDisplayValue(display);
      onChange(displayValue, d);
    } catch {
      setDisplayValue("0.00");
      onChange("0.00", D(0));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Only allow digits, one decimal point, and a leading minus
    if (/^-?\d*\.?\d{0,2}$/.test(raw) || raw === "" || raw === "-") {
      setDisplayValue(raw);
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      value={isFocused ? displayValue : (displayValue || placeholder)}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      placeholder={placeholder}
      className={cn(
        "w-full rounded border border-[--border-strong] bg-[--bg-elevated]",
        "px-3 py-2 text-right text-[13px] tabular-nums text-[--text-primary]",
        "transition-[border-color,box-shadow] duration-[150ms] ease-[ease]",
        "placeholder:text-[--text-dim]",
        "focus:outline-none focus:border-[--accent]",
        "focus:shadow-[0_0_0_3px_rgba(200,150,122,0.15)]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    />
  );
}
