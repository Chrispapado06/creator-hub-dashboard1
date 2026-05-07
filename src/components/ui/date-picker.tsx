"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Clock as ClockIcon, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  /** Allow clearing the selected value via an inline ✕ button */
  clearable?: boolean;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  size = "default",
  clearable = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn(
            "w-full justify-start font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="h-4 w-4 opacity-70" />
          <span className="flex-1 text-left">
            {value ? format(value, "MMM d, yyyy") : placeholder}
          </span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange?.(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange?.(null); } }}
              className="ml-1 rounded-full opacity-50 hover:opacity-100 hover:bg-secondary p-0.5 cursor-pointer"
              aria-label="Clear date"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(d) => { onChange?.(d ?? null); setOpen(false); }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

type DateTimePickerProps = {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  clearable?: boolean;
};

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
  disabled,
  size = "default",
  clearable = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [timeStr, setTimeStr] = React.useState(value ? format(value, "HH:mm") : "12:00");

  React.useEffect(() => {
    if (value) setTimeStr(format(value, "HH:mm"));
  }, [value]);

  const applyDateTime = (date: Date | undefined, time: string) => {
    if (!date) {
      onChange?.(null);
      return;
    }
    const [h, m] = time.split(":").map((n) => Number(n));
    const next = new Date(date);
    next.setHours(h || 0, m || 0, 0, 0);
    onChange?.(next);
  };

  const onDateSelect = (d: Date | undefined) => applyDateTime(d, timeStr);
  const onTimeChange = (newTime: string) => {
    setTimeStr(newTime);
    if (value) applyDateTime(value, newTime);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn(
            "w-full justify-start font-normal",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="h-4 w-4 opacity-70" />
          <span className="flex-1 text-left">
            {value ? format(value, "MMM d, yyyy · h:mm a") : placeholder}
          </span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange?.(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange?.(null); } }}
              className="ml-1 rounded-full opacity-50 hover:opacity-100 hover:bg-secondary p-0.5 cursor-pointer"
              aria-label="Clear"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={onDateSelect}
          autoFocus
        />
        <div className="border-t border-border p-3 flex items-center gap-2">
          <ClockIcon className="h-4 w-4 text-muted-foreground" />
          <input
            type="time"
            value={timeStr}
            onChange={(e) => onTimeChange(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
