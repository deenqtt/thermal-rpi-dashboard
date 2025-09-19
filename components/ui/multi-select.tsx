"use client";

import * as React from "react";
import Select, { Props } from "react-select";
import { cn } from "@/lib/utils"; // Assumes you have this utility from Shadcn

export const MultiSelect = <
  Option,
  IsMulti extends boolean = false,
  Group extends any = any
>(
  props: Props<Option, IsMulti, Group>
) => {
  return (
    <Select
      {...props}
      classNames={{
        control: (state) =>
          cn(
            "flex !min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            state.isFocused && "ring-2 ring-ring ring-offset-2"
          ),
        input: () => "text-sm",
        placeholder: () => "text-muted-foreground",
        multiValue: () => "rounded-sm bg-muted text-muted-foreground mr-1",
        multiValueLabel: () => "px-1 text-xs",
        multiValueRemove: () =>
          "rounded-sm hover:bg-destructive hover:text-destructive-foreground",
        menu: () =>
          "mt-2 p-1 rounded-md border bg-popover text-popover-foreground",
        option: (state) =>
          cn(
            "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
            state.isSelected && "font-semibold",
            state.isFocused && "bg-accent text-accent-foreground"
          ),
      }}
    />
  );
};
