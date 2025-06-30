import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { cn } from "@/lib/utils";

export interface PlanFeature {
  title: string;
}

export interface PlanProps {
  title: string;
  monthlyPrice: number;
  discountedPrice?: number;
  features: PlanFeature[];
  variant: "dark" | "green" | "blue" | "purple";
  cta: string;
  onSelect: () => void;
}

export default function PlanCard({ 
  title, 
  monthlyPrice, 
  discountedPrice, 
  features, 
  variant, 
  cta, 
  onSelect 
}: PlanProps) {
  const getBackgroundClass = () => {
    switch (variant) {
      case "dark": return "card-gradient-dark";
      case "green": return "card-gradient-green";
      case "blue": return "card-gradient-blue";
      case "purple": return "card-gradient-purple";
      default: return "card-gradient-dark";
    }
  };

  return (
    <div className={cn(
      "text-white rounded-xl p-6 flex flex-col h-full",
      getBackgroundClass()
    )}>
      <h2 className="text-2xl font-bold mb-1">{title}</h2>
      
      <div className="flex items-baseline mb-2">
        {discountedPrice ? (
          <>
            <span className="text-xl line-through text-gray-300">${monthlyPrice}</span>
            <span className="text-3xl font-bold ml-2">${discountedPrice}</span>
          </>
        ) : (
          <span className="text-3xl font-bold">${monthlyPrice}</span>
        )}
        <span className="text-sm text-gray-300 ml-1">/month</span>
      </div>
      
      {discountedPrice && (
        <div className="text-sm text-gray-300 mb-6">billed yearly</div>
      )}
      
      <ul className="space-y-4 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 mr-2 text-gray-400" />
            <span>{feature.title}</span>
          </li>
        ))}
      </ul>
      
      <button 
        onClick={onSelect}
        className="mt-6 w-full py-3 bg-white text-black rounded-lg hover:bg-gray-100 transition-colors font-medium"
      >
        {cta}
      </button>
    </div>
  );
}
