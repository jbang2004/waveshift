import { useState } from "react";
import { m as motion } from "@/lib/lazy-motion";
import { cn } from "@/lib/utils";

interface PricingToggleProps {
  onToggle: (isYearly: boolean) => void;
  defaultYearly?: boolean;
}

export default function PricingToggle({ onToggle, defaultYearly = true }: PricingToggleProps) {
  const [isYearly, setIsYearly] = useState(defaultYearly);

  const handleToggle = (yearly: boolean) => {
    setIsYearly(yearly);
    onToggle(yearly);
  };

  return (
    <div className="bg-white rounded-lg p-2 inline-flex mx-auto mb-8 border border-gray-200 relative">
      <motion.div
        className="absolute inset-y-2 rounded-md bg-blue-500"
        initial={false}
        animate={{
          x: isYearly ? 4 : "50%",
          width: "calc(50% - 8px)"
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
      <button 
        className={cn(
          "py-1 px-6 rounded-md text-sm font-medium z-10 transition-colors relative",
          isYearly ? "text-white" : "text-gray-700"
        )}
        onClick={() => handleToggle(true)}
      >
        Yearly
      </button>
      <button 
        className={cn(
          "py-1 px-6 rounded-md text-sm font-medium z-10 transition-colors relative",
          !isYearly ? "text-white" : "text-gray-700"
        )}
        onClick={() => handleToggle(false)}
      >
        Monthly
      </button>
    </div>
  );
}
