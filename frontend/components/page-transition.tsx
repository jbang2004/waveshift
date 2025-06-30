import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  location: string;
}

export default function PageTransition({ children, location }: PageTransitionProps) {
  return (
    <div 
      key={location} 
      className="w-full page-enter-animation"
    >
      {children}
    </div>
  );
}
