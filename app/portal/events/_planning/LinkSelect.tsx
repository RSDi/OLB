"use client";
import { useRouter } from "next/navigation";
import { FilterSelect } from "../../../components/FilterControls";

export interface LinkOption {
  value: string;
  label: string;
  href: string;
}

// The Directory's chip drop-down, for Planning's server-rendered views: each
// option is a link, so picking one goes to its page.
export function LinkSelect({
  label,
  value,
  options,
  active,
  ...rest
}: {
  label: string;
  value: string;
  options: LinkOption[];
  active: boolean;
  "data-tour"?: string;
}) {
  const router = useRouter();
  return (
    <FilterSelect
      value={value}
      onChange={(e) => {
        const to = options.find((o) => o.value === e.target.value);
        if (to) router.push(to.href);
      }}
      aria-label={label}
      data-tour={rest["data-tour"]}
      grow
      active={active}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </FilterSelect>
  );
}
