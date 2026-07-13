interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
        style={{ color: "var(--gv-text-secondary)" }}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search nodes..."
        className="w-full pl-10 pr-3 py-2 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-[var(--gv-accent)] focus:border-transparent"
        style={{
          background: "var(--gv-surface-raised)",
          border: "1px solid var(--gv-border)",
          color: "var(--gv-text-primary)",
        }}
      />
    </div>
  );
}
