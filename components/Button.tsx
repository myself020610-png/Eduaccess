import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
  label: string;
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', icon, label, className = '', ...props }) => {
  const baseStyles = "flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-bold transition-all transform active:scale-95 focus:outline-none focus:ring-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none";
  
  const variants = {
    primary: "bg-access-accent text-access-dark hover:bg-yellow-300 focus:ring-yellow-500/50 shadow-lg shadow-yellow-500/20",
    secondary: "bg-slate-700 text-white hover:bg-slate-600 focus:ring-slate-500/50 border-2 border-slate-600",
    danger: "bg-access-alert text-white hover:bg-red-600 focus:ring-red-500/50"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      aria-label={label}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default Button;