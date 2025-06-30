import { useState } from "react";
import dynamic from "next/dynamic";
import { m as motion } from "@/lib/lazy-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

const AnimatePresence = dynamic(() => import("framer-motion").then(mod => mod.AnimatePresence), {
  ssr: false,
  loading: () => null,
});

export default function FaqAccordion({ items }: FaqAccordionProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const toggleItem = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {items.map((item, index) => (
        <div 
          key={index} 
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
        >
          <button
            className="w-full flex justify-between items-center focus:outline-none"
            onClick={() => toggleItem(index)}
            aria-expanded={expandedIndex === index}
          >
            <h3 className="font-semibold text-lg text-left">{item.question}</h3>
            <ChevronDown 
              className={cn(
                "h-5 w-5 text-gray-500 transition-transform duration-200",
                expandedIndex === index && "transform rotate-180"
              )} 
            />
          </button>
          
          <AnimatePresence initial={false}>
            {expandedIndex === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="pt-4 text-gray-600">
                  {item.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
