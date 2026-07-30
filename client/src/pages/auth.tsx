import { useState, useEffect, useRef, ReactNode } from "react";
import { useLocation, useSearchParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TechnicalLabel from "@/components/ui/technical-label";
import Barcode from "@/components/ui/barcode";
import { useToast } from "@/hooks/use-toast";
import { Delete, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { InviteAcceptCard } from "@/components/auth/InviteAcceptCard";

// Animated Placeholder Component
function AnimatedPlaceholder({ examples, className = "text-muted-foreground" }: { examples: string[]; className?: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const example = examples[currentIndex];
    let timeout: NodeJS.Timeout;

    if (isTyping) {
      if (currentText.length < example.length) {
        timeout = setTimeout(() => {
          setCurrentText(example.slice(0, currentText.length + 1));
        }, 100);
      } else {
        timeout = setTimeout(() => setIsTyping(false), 1000);
      }
    } else {
      if (currentText.length > 0) {
        timeout = setTimeout(() => {
          setCurrentText(currentText.slice(0, -1));
        }, 50);
      } else {
        setCurrentIndex((prev) => (prev + 1) % examples.length);
        setIsTyping(true);
      }
    }

    return () => clearTimeout(timeout);
  }, [currentText, currentIndex, examples, isTyping]);

  return (
    <span className={className}>
      {currentText}<span className="animate-pulse">|</span>
    </span>
  );
}

// Disposable email domains list (50+ domains)
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  '10minutemail.com', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'maildrop.cc', 'getnada.com', 'tempr.email',
  'throwawaymail.com', 'sharklasers.com', 'guerrillamail.info', 'grr.la',
  'spam4.me', 'mintemail.com', 'emailondeck.com', 'tempinbox.com',
  'dispostable.com', 'anonbox.net', 'mohmal.com', 'mytemp.email',
  'emailfake.com', 'temp-link.net', 'jetable.org', 'getairmail.com',
  'inboxbear.com', 'spamgourmet.com', 'mailnesia.com', 'tempsky.com',
  'guerrillamailblock.com', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'spam4.me', 'grr.la', 'guerrillamail.com',
  'trbvm.com', 'anonymbox.com', 'binkmail.com', 'trashmail.net',
  'trashmail.me', 'trashmail.io', 'throwam.com', 'caseedu.tk',
  'spambox.us', 'tmail.com', 'tmailinator.com', 'trillianpro.com',
  'vomoto.com', 'bobmail.info', 'chammy.info', 'devnullmail.com',
  'letthemeatspam.com', 'mailinater.com', 'mailinator2.com', 'sogetthis.com',
  'thisisnotmyrealemail.com', 'suremail.info', 'spamhereplease.com'
];

// Common email typos for popular domains
const EMAIL_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'gmai.co': 'gmail.com',
  'gmailc.om': 'gmail.com'
};

// Pakistani mobile operator prefixes (all major operators)
const PAKISTANI_OPERATOR_PREFIXES = [
  // Jazz (Mobilink)
  '300', '301', '302', '303', '304', '305', '306', '307', '308', '309',
  // Telenor
  '340', '341', '342', '343', '344', '345', '346', '347', '348', '349',
  // Zong
  '310', '311', '312', '313', '314', '315', '316', '317', '318', '319',
  // Ufone
  '330', '331', '332', '333', '334', '335', '336', '337',
  // SCO/SCOM
  '355',
  // Warid (now part of Jazz)
  '320', '321', '322', '323', '324', '325',
  // Instaphone/Telenor
  '370'
];

// Enhanced email validation with RFC 5322 compliance, typo detection, and disposable email blocking
const validateEmail = (email: string) => {
  if (!email) {
    return { valid: true, message: "" };
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Basic RFC 5322 format check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, message: "Invalid email" };
  }

  const domain = trimmedEmail.split('@')[1];

  if (!domain) {
    return { valid: false, message: "Invalid email" };
  }

  // Check for common email typos
  if (EMAIL_TYPOS[domain]) {
    return {
      valid: false,
      message: `Did you mean ${EMAIL_TYPOS[domain]}? Please check your email address.`
    };
  }

  // Check against disposable email domains
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    return { valid: false, message: "Temporary email addresses are not allowed" };
  }

  // Pattern matching for common disposable email formats
  if (domain.includes('temp') || domain.includes('disposable') ||
    domain.includes('trash') || domain.includes('throwaway') ||
    domain.includes('fake') || domain.includes('guerrilla')) {
    return { valid: false, message: "Temporary email addresses are not allowed" };
  }

  // Check for role-based addresses (optional, commonly blocked)
  const localPart = trimmedEmail.split('@')[0];
  const roleBasedPrefixes = ['admin', 'noreply', 'no-reply', 'support', 'info', 'sales', 'marketing', 'webmaster', 'postmaster'];
  if (roleBasedPrefixes.includes(localPart)) {
    return { valid: false, message: "Role-based email addresses are not allowed. Please use a personal email." };
  }

  // Valid TLD check (ensure domain has a valid extension)
  const tld = domain.split('.').pop();
  if (!tld || tld.length < 2) {
    return { valid: false, message: "Invalid email" };
  }

  return { valid: true, message: "" };
};

// Enhanced phone validation with Pakistani operator prefix checks
const validatePhone = (phone: string) => {
  // If phone is empty, it's valid (optional field)
  if (!phone || phone.trim() === '') {
    return { valid: true, message: "" };
  }

  const cleanPhone = phone.replace(/[\s\-()]/g, '');

  // Check Pakistani mobile number format
  const pkMobileRegex = /^(\+92|92|0)?3(\d{2})(\d{7})$/;
  const match = cleanPhone.match(pkMobileRegex);

  if (match) {
    // Build the full 3-digit operator prefix (3 + the next 2 digits)
    const operatorPrefix = '3' + match[2];

    // Validate operator prefix
    if (!PAKISTANI_OPERATOR_PREFIXES.includes(operatorPrefix)) {
      return {
        valid: false,
        message: "This mobile number prefix is not recognized"
      };
    }

    return { valid: true, message: "" };
  }

  // If doesn't match Pakistani format, provide helpful error
  return {
    valid: false,
    message: "Invalid phone"
  };
};

// Password strength calculation
const calculatePasswordStrength = (password: string): { level: number; label: string; color: string } => {
  if (!password) {
    return { level: 0, label: '', color: '' };
  }

  let strength = 0;
  const checks = {
    length: password.length >= 6,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^a-zA-Z0-9]/.test(password)
  };

  // Calculate strength
  if (checks.length) strength++;
  if (checks.lowercase) strength++;
  if (checks.uppercase) strength++;
  if (checks.number) strength++;
  if (checks.special) strength++;

  // Determine level and color
  if (strength <= 2) {
    return { level: 1, label: 'Weak', color: 'bg-red-500' };
  } else if (strength === 3) {
    return { level: 2, label: 'Fair', color: 'bg-orange-500' };
  } else if (strength === 4) {
    return { level: 3, label: 'Good', color: 'bg-yellow-500' };
  } else {
    return { level: 4, label: 'Strong', color: 'bg-green-500' };
  }
};

// Sleek minimal tag-style label
const FieldTag = ({ children, className }: { children: ReactNode, className?: string }) => (
  <div className={cn(
    "inline-flex items-center px-2 py-0.5 bg-black text-white text-[10px] font-black tracking-[0.15em] uppercase rounded-sm mb-1 line-height-1",
    className
  )}>
    {children}
  </div>
);

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  identity: z.string().min(1, "Identity is required"),
  phone: z.string().optional().refine(
    (phone) => validatePhone(phone || '').valid,
    (phone) => ({ message: validatePhone(phone || '').message })
  ),
  email: z.string().email("Please enter a valid email address").refine(
    (email) => validateEmail(email).valid,
    (email) => ({ message: validateEmail(email).message })
  ),
  password: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(128)
    .refine(
      (pwd) => pwd.length < 8 || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pwd),
      "For passwords of 8+ characters, include at least one uppercase letter, one lowercase letter, and one number.",
    ),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
  role: z.enum(["user", "team", "founder", "admin"]).default("user")
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"]
});

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address").refine(
    (email) => validateEmail(email).valid,
    (email) => ({ message: validateEmail(email).message })
  ),
  password: z.string().min(1, "Password is required")
});

type RegisterForm = z.infer<typeof registerSchema>;
type LoginForm = z.infer<typeof loginSchema>;

// Auth view state machine
type AuthView = 'register' | 'login' | 'verify-otp' | 'forgot-password';

export default function Auth() {
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const [activeTab, setActiveTab] = useState("register");
  const [authView, setAuthView] = useState<AuthView>('register');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [generatedIdentity, setGeneratedIdentity] = useState<string>('');
  const [emailValidation, setEmailValidation] = useState<{ valid: boolean; message: string }>({ valid: true, message: "" });
  const [phoneValidation, setPhoneValidation] = useState<{ valid: boolean; message: string }>({ valid: true, message: "" });
  const [passwordStrength, setPasswordStrength] = useState<{ level: number; label: string; color: string }>({ level: 0, label: '', color: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OTP Verification state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpSource, setOtpSource] = useState<'register' | 'login' | 'reset'>('register');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [pendingRegData, setPendingRegData] = useState<any>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot Password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [newPasswordStrength, setNewPasswordStrength] = useState<{ level: number; label: string; color: string }>({ level: 0, label: '', color: '' });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleAnimationComplete = () => {
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 100);
  };

  // ── OTP Handlers ──

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpDigits];
    next[index] = value.slice(-1);
    setOtpDigits(next);
    if (value && index < 5) otpInputRefs.current[index + 1]?.focus();
    // Auto-submit when all 6 filled
    if (next.every(d => d !== '') && next.join('').length === 6) {
      handleOtpSubmit(next.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (_code: string) => {
    toast({ title: "Not Available", description: "Email OTP verification is not configured.", variant: "destructive" });
  };

  const handleResendOtp = async () => {
    toast({ title: "Not Available", description: "Email OTP verification is not configured.", variant: "destructive" });
  };

  // ── Forgot Password Handlers ──

  const handleForgotSubmitEmail = async () => {
    if (isSubmitting || !forgotEmail) return;
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/forgot-password", { email: forgotEmail });
      toast({
        title: "Request Received",
        description: "Please contact support to complete your password reset.",
      });
      setAuthView('login');
      setActiveTab('login');
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit request.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    toast({
      title: "Not Available",
      description: "Self-service password reset is not available. Please contact support.",
      variant: "destructive"
    });
  };

  // Identity generation function
  const generateThorxIdentity = (firstName: string, lastName: string): string => {
    const thorxPrefixes = ['THORX', 'EARN', 'DIGI', 'CYBER', 'PRIME', 'ALPHA', 'CORE', 'ELITE'];
    const thorxSuffixes = ['MASTER', 'FORCE', 'AGENT', 'BUILDER', 'TRADER', 'GENIUS', 'COMMANDER', 'PIONEER'];
    const numbers = Math.floor(Math.random() * 9999) + 1000;

    if (firstName && lastName) {
      const prefix = thorxPrefixes[Math.floor(Math.random() * thorxPrefixes.length)];
      const suffix = thorxSuffixes[Math.floor(Math.random() * thorxSuffixes.length)];
      const initial = firstName.charAt(0).toUpperCase() + lastName.charAt(0).toUpperCase();
      return `${prefix}_${initial}_${suffix}_${numbers}`;
    }
    return '';
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Backspace' && e.target === document.body) {
        e.preventDefault();
        setLocation("/");
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [setLocation]);

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      identity: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      referralCode: "",
      role: "user" as const
    }
  });

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  // Watch name for identity generation
  const name = registerForm.watch('name');

  useEffect(() => {
    if (name && name.trim().length >= 2) {
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      // Use last word as last name; fall back to first word if single name entered
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      const identity = generateThorxIdentity(firstName, lastName);
      setGeneratedIdentity(identity);
      registerForm.setValue('identity', identity);
    }
  }, [name, registerForm]);

  const onRegisterSubmit = async (data: RegisterForm) => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const nameParts = data.name.trim().split(' ');
      const firstName = nameParts[0];
      // Single-word names must not be cloned into the last name field.
      const lastName = nameParts.slice(1).join(' ');

      const fingerprint = await getDeviceFingerprint();

      const resp = await apiRequest("POST", "/api/register", {
        firstName,
        lastName,
        email: data.email,
        password: data.password,
        phone: data.phone || "",
        identity: data.identity,
        referralCode: data.referralCode || "",
        role: data.role,
        deviceFingerprint: fingerprint,
      });
      const result = await resp.json();

      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      queryClient.setQueryData(["session-auth"], result.user);
      toast({ title: "Registration Successful!", description: `Welcome to THORX, ${firstName}!` });
      setLocation(data.role === 'team' || data.role === 'founder' || data.role === 'admin' ? "/team-portal" : "/user-portal");
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message || "Failed to create account.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onLoginSubmit = async (data: LoginForm) => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const fingerprint = await getDeviceFingerprint();

      const response = await apiRequest("POST", "/api/login", {
        email: data.email,
        password: data.password,
        deviceFingerprint: fingerprint,
      });

      const result = await response.json();

      queryClient.setQueryData(["session-auth"], result.user);
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      toast({ title: "Login Successful!", description: "Welcome back!" });
      const role = result.user?.role;
      setLocation(role === 'team' || role === 'founder' || role === 'admin' ? "/team-portal" : "/user-portal");
    } catch (error: any) {
      toast({ title: "Login Failed", description: error.message || "Invalid email or password", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // A ?invite=TOKEN link (issued from Team Keys) replaces the normal
  // login/register tabs entirely with the invitation-acceptance flow — it's a
  // one-time entry point, not another tab in the existing state machine.
  if (inviteToken) {
    return <InviteAcceptCard token={inviteToken} />;
  }

  return (
    <motion.div
      className="auth-page overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onAnimationComplete={handleAnimationComplete}
    >
      {/* Industrial Grid Overlay */}
      <div className="industrial-grid" />

      {/* Navigation Header */}
      <nav className="fixed top-0 w-full z-50 bg-background border-b-3 border-black" data-testid="auth-navigation">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Left Section */}
            <div className="flex items-center">
              <button
                onClick={() => setLocation("/")}
                className="bg-black text-white px-2 py-1 md:px-4 md:py-2 border-2 border-black hover:bg-primary transition-colors flex items-center gap-2"
                data-testid="button-back-home"
              >
                <Delete className="w-4 h-4" />
                <TechnicalLabel text="BACKSPACE" className="text-white text-xs md:text-sm" />
              </button>
            </div>

            {/* Right Section */}
            <div className="flex items-center">
              <div
                className="bg-white border-2 border-black px-2 py-1 md:px-4 md:py-2 transition-all duration-300"
              >
                <div className="flex items-center gap-3 text-xs md:text-sm">
                  <TechnicalLabel text="v1.0" className="font-mono tracking-[0.2em] opacity-40" />
                  <div className="h-3 w-[1px] bg-black/10" />
                  <TechnicalLabel text="ONLINE" className="font-bold tracking-wider" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Title Section */}
        <div className="bg-white border-b-3 border-black py-3 md:py-4">
          <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter" data-testid="auth-logo">
              THORX.
            </h1>
          </div>
        </div>
      </nav>

      {/* Auth Section */}
      <section className="cinematic-section active min-h-screen pb-8 overflow-y-auto overscroll-behavior-contain">
        <div className="max-w-7xl mx-auto px-4 md:px-8 pb-20">
          {/* Technical Header */}
          <div className="text-center mb-4 md:mb-6">
            <Barcode variant="bold" className="w-32 md:w-48 h-8 md:h-10 mx-auto" />
          </div>

          {/* Auth Card */}
          <motion.div
            className="w-full max-w-3xl mx-auto mb-8 px-2 md:px-0"
            initial={{ y: -1000, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{
              type: "spring",
              damping: 14,      // Slightly more damped for a "real" physics feel
              stiffness: 120,    // Lower stiffness for a more weighted, natural fall
              mass: 1,
              delay: 0.2
            }}
          >
            <div className="split-card bg-white border-3 border-black p-3 md:p-6 lg:p-10 overflow-visible w-full">

              {/* OTP Verification View */}
              {authView === 'verify-otp' && (
                <div className="max-w-[480px] mx-auto w-full space-y-6 md:space-y-8">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto bg-black rounded-none flex items-center justify-center border-2 border-black">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8L12 2 3 8v8l9 6 9-6z"/><path d="m3 8 9 6 9-6"/><path d="M12 2v12"/></svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">VERIFY EMAIL</h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      We sent a 6-digit code to <span className="font-bold text-black">{otpEmail}</span>. Enter it below.
                    </p>
                  </div>

                  <div className="flex justify-center gap-2 md:gap-3">
                    {otpDigits.map((digit, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpInputRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={(e) => {
                          e.preventDefault();
                          const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                          if (pasted.length === 6) {
                            const digits = pasted.split('');
                            setOtpDigits(digits);
                            handleOtpSubmit(pasted);
                          }
                        }}
                        className="w-11 h-14 md:w-14 md:h-16 text-center text-2xl md:text-3xl font-black border-2 border-black focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all bg-[#F5F5F3]"
                        data-testid={`otp-input-${i}`}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  {isSubmitting && (
                    <div className="flex justify-center">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin" />
                        <span className="font-bold tracking-wider">VERIFYING...</span>
                      </div>
                    </div>
                  )}

                  <div className="text-center space-y-4">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendCooldown > 0}
                      className="text-sm font-bold text-primary hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid="button-resend-otp"
                    >
                      {resendCooldown > 0 ? `RESEND IN ${resendCooldown}s` : 'RESEND CODE'}
                    </button>

                    <div className="pt-4 border-t border-black/10">
                      <button
                        type="button"
                        onClick={() => { setAuthView(otpSource === 'reset' ? 'forgot-password' : activeTab as AuthView); setOtpDigits(['', '', '', '', '', '']); }}
                        className="text-sm font-bold text-muted-foreground hover:text-black transition-colors"
                        data-testid="button-back-from-otp"
                      >
                        ← BACK
                      </button>
                    </div>

                    <p className="text-xs text-muted-foreground/60 max-w-xs mx-auto">
                      Check your spam folder if you don't see the email. Code expires in 5 minutes.
                    </p>
                  </div>
                </div>
              )}

              {/* Forgot Password View */}
              {authView === 'forgot-password' && (
                <div className="max-w-[480px] mx-auto w-full space-y-6 md:space-y-8">
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto bg-black rounded-none flex items-center justify-center border-2 border-black">
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                      {forgotStep === 1 ? 'RESET PASSWORD' : forgotStep === 3 ? 'NEW PASSWORD' : 'RESET PASSWORD'}
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                      {forgotStep === 1 && 'Enter your email address to receive a reset code.'}
                      {forgotStep === 3 && 'Choose a strong new password for your account.'}
                    </p>
                  </div>

                  {/* Step 1: Email input */}
                  {forgotStep === 1 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">Email Address</label>
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          className="w-full border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 outline-none focus:border-primary transition-colors"
                          placeholder="your@email.com"
                          data-testid="input-forgot-email"
                          autoFocus
                        />
                      </div>
                      <Button
                        onClick={handleForgotSubmitEmail}
                        disabled={isSubmitting || !forgotEmail}
                        className="w-full bg-black text-white text-lg font-black py-4 md:py-5 hover:bg-primary transition-colors border-2 border-black disabled:opacity-50"
                        data-testid="button-send-reset-code"
                      >
                        {isSubmitting ? 'SENDING...' : 'SEND RESET CODE'}
                      </Button>
                    </div>
                  )}

                  {/* Step 3: New password */}
                  {forgotStep === 3 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">New Password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 outline-none focus:border-primary transition-colors"
                          placeholder="Enter new password"
                          data-testid="input-new-password"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black tracking-[0.2em] text-black/50 uppercase">Confirm Password</label>
                        <input
                          type="password"
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          className="w-full border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 outline-none focus:border-primary transition-colors"
                          placeholder="Confirm new password"
                          data-testid="input-confirm-new-password"
                        />
                      </div>
                      <Button
                        onClick={handleResetPassword}
                        disabled={isSubmitting || !newPassword || !confirmNewPassword}
                        className="w-full bg-primary text-white text-lg font-black py-4 md:py-5 hover:bg-black transition-colors border-2 border-black disabled:opacity-50"
                        data-testid="button-reset-password"
                      >
                        {isSubmitting ? 'RESETTING...' : 'SET NEW PASSWORD'}
                      </Button>
                    </div>
                  )}

                  <div className="text-center pt-4 border-t border-black/10">
                    <button
                      type="button"
                      onClick={() => { setAuthView('login'); setActiveTab('login'); setForgotStep(1); }}
                      className="text-sm font-bold text-muted-foreground hover:text-black transition-colors"
                      data-testid="button-back-to-login"
                    >
                      ← BACK TO LOGIN
                    </button>
                  </div>
                </div>
              )}

              {/* Register / Login Tabs */}
              {(authView === 'register' || authView === 'login') && (
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setAuthView(v as AuthView); }} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 md:mb-8 bg-muted border-2 border-black">
                  <TabsTrigger
                    value="register"
                    className="data-[state=active]:bg-black data-[state=active]:text-white font-black text-sm md:text-base"
                    data-testid="tab-register"
                  >
                    REGISTER
                  </TabsTrigger>
                  <TabsTrigger
                    value="login"
                    className="data-[state=active]:bg-black data-[state=active]:text-white font-black text-sm md:text-base"
                    data-testid="tab-login"
                  >
                    LOGIN
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="register" className="space-y-6 md:space-y-8 overflow-visible min-h-[auto] md:min-h-[650px]">
                  <Form {...registerForm}>
                    <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-6 md:space-y-8 overflow-visible">
                      {/* Name and Email Fields - Side by Side */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        {/* Name Field */}
                        <FormField
                          control={registerForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Full Name</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    ref={(e) => {
                                      field.ref(e);
                                      // @ts-ignore
                                      firstInputRef.current = e;
                                    }}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4"
                                    data-testid="input-register-name"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                                      <AnimatedPlaceholder examples={['John Khan', 'Ahmed Shah', 'Ali Malik', 'Hassan Ahmed']} />
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />

                        {/* Email Field */}
                        <FormField
                          control={registerForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Email Address</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      const validation = validateEmail(e.target.value);
                                      setEmailValidation(validation);
                                    }}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 transition-colors duration-200"
                                    data-testid="input-register-email"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                                      <AnimatedPlaceholder examples={['your.email@gmail.com', 'user@thorx.com', 'john.doe@outlook.com']} />
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              {!emailValidation.valid && field.value && (
                                <div className="flex items-start gap-2 mt-2 p-3 bg-red-50 border-l-4 border-red-500 rounded">
                                  <span className="text-red-600 text-base font-bold mt-0.5">⚠</span>
                                  <p className="text-sm text-red-900 leading-relaxed font-medium">{emailValidation.message}</p>
                                </div>
                              )}
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Identity Field - Full Width */}
                      <FormField
                        control={registerForm.control}
                        name="identity"
                        render={({ field }) => (
                          <FormItem className="space-y-2">
                            <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                              <FieldTag>Identity (Generated)</FieldTag>
                            </FormLabel>
                            <div className="space-y-2">
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    readOnly
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 bg-black text-white cursor-not-allowed"
                                    data-testid="input-register-identity"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                                      <AnimatedPlaceholder examples={['THORX_JD_MASTER_4521', 'ALPHA_AK_BUILDER_7832', 'CORE_HS_GENIUS_2941']} />
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              <div className="text-xs text-muted-foreground mt-2 px-1">
                                <TechnicalLabel text="FIXED" className="text-xs" />
                              </div>
                            </div>
                            <FormMessage className="mt-2" />
                          </FormItem>
                        )}
                      />



                      {/* Password Fields */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        <FormField
                          control={registerForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Security Password</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="space-y-2">
                                  <div className="relative">
                                    <Input
                                      type={showPassword ? "text" : "password"}
                                      {...field}
                                      onChange={(e) => {
                                        field.onChange(e);
                                        const strength = calculatePasswordStrength(e.target.value);
                                        setPasswordStrength(strength);
                                      }}
                                      className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 pr-12"
                                      data-testid="input-register-password"
                                    />
                                    {!field.value && (
                                      <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none pr-12">
                                        <AnimatedPlaceholder examples={['ThorX123!', 'SecurePass9$', 'MyStrong8#']} />
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setShowPassword(!showPassword)}
                                      className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded-sm hover:bg-muted/50 transition-all duration-200 group"
                                      data-testid="button-toggle-password"
                                    >
                                      {showPassword ? (
                                        <EyeOff className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                      ) : (
                                        <Eye className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                      )}
                                    </button>
                                  </div>

                                  {/* Password Strength Indicator */}
                                  {field.value && (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                                            style={{ width: `${(passwordStrength.level / 4) * 100}%` }}
                                          />
                                        </div>
                                        <span className={`text-xs font-semibold ${passwordStrength.level === 1 ? 'text-red-600' :
                                          passwordStrength.level === 2 ? 'text-orange-600' :
                                            passwordStrength.level === 3 ? 'text-yellow-600' :
                                              'text-green-600'
                                          }`}>
                                          {passwordStrength.label}
                                        </span>
                                      </div>

                                      {/* Requirements Checklist */}
                                      <div className="space-y-1 text-xs">
                                        <div className={`flex items-center gap-1.5 ${/^.{6,}$/.test(field.value) ? 'text-green-600' : 'text-muted-foreground'}`}>
                                          <span className="text-sm">{/^.{6,}$/.test(field.value) ? '✓' : '○'}</span>
                                          <span>At least 6 characters</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${field.value.length < 8 || /[A-Z]/.test(field.value) ? 'text-green-600' : 'text-muted-foreground'}`}>
                                          <span className="text-sm">{field.value.length < 8 || /[A-Z]/.test(field.value) ? '✓' : '○'}</span>
                                          <span>Uppercase (required if 8+ chars)</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${field.value.length < 8 || /[a-z]/.test(field.value) ? 'text-green-600' : 'text-muted-foreground'}`}>
                                          <span className="text-sm">{field.value.length < 8 || /[a-z]/.test(field.value) ? '✓' : '○'}</span>
                                          <span>Lowercase (required if 8+ chars)</span>
                                        </div>
                                        <div className={`flex items-center gap-1.5 ${field.value.length < 8 || /\d/.test(field.value) ? 'text-green-600' : 'text-muted-foreground'}`}>
                                          <span className="text-sm">{field.value.length < 8 || /\d/.test(field.value) ? '✓' : '○'}</span>
                                          <span>Number (required if 8+ chars)</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={registerForm.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Confirm Password</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showConfirmPassword ? "text" : "password"}
                                    {...field}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 pr-12"
                                    data-testid="input-register-confirm-password"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none pr-12">
                                      <AnimatedPlaceholder examples={['Repeat your password', 'Same as above', 'Confirm password']} />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded-sm hover:bg-muted/50 transition-all duration-200 group"
                                    data-testid="button-toggle-confirm-password"
                                  >
                                    {showConfirmPassword ? (
                                      <EyeOff className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    ) : (
                                      <Eye className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    )}
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Optional Fields Section */}
                      <div className="relative py-4">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                          <div className="w-full border-t-2 border-black/10"></div>
                        </div>
                        <div className="relative flex justify-center">
                          <span className="bg-[#F5F5F3] px-2 text-[10px] font-black tracking-[0.2em] text-black/20 uppercase">OPTIONAL</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                        {/* Phone Field */}
                        <FormField
                          control={registerForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Phone/WhatsApp</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      const validation = validatePhone(e.target.value);
                                      setPhoneValidation(validation);
                                    }}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 transition-colors duration-200"
                                    data-testid="input-register-phone"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                                      <AnimatedPlaceholder examples={['+92 300 1234567', '03001234567', '+92 321 9876543']} />
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              {!phoneValidation.valid && field.value && field.value.trim() !== '' && (
                                <div className="flex items-start gap-2 mt-2 p-3 bg-red-50 border-l-4 border-red-500 rounded">
                                  <span className="text-red-600 text-base font-bold mt-0.5">⚠</span>
                                  <p className="text-sm text-red-900 leading-relaxed font-medium">{phoneValidation.message}</p>
                                </div>
                              )}
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />

                        {/* Referral Code */}
                        <FormField
                          control={registerForm.control}
                          name="referralCode"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Referral Code (Optional)</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 pr-12 bg-primary text-white"
                                    data-testid="input-register-referral"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none pr-12">
                                      <AnimatedPlaceholder examples={['THORX-A1B2', 'THORX-X9Y8', 'THORX-K3M7']} className="text-white" />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const text = await navigator.clipboard.readText();
                                        registerForm.setValue('referralCode', text.trim());
                                        toast({
                                          title: "Pasted!",
                                          description: "Referral code pasted from clipboard",
                                        });
                                      } catch (err) {
                                        toast({
                                          title: "Paste failed",
                                          description: "Unable to read from clipboard",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 z-10 p-2 rounded-md bg-white/10 backdrop-blur-sm group"
                                    data-testid="button-paste-referral"
                                    aria-label="Paste referral code"
                                  >
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="18"
                                      height="18"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="text-white"
                                    >
                                      <rect width="8" height="4" x="8" y="2" rx="1.5" ry="1.5" />
                                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                    </svg>
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="pt-4">
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="w-full bg-black text-white text-lg md:text-xl font-black py-4 md:py-5 hover:bg-primary transition-colors border-2 border-black disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-register-submit"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="mr-2 h-5 w-5 animate-spin inline" />PROCESSING</>
                          ) : "Enter"}
                        </Button>
                      </div>
                    </form>
                  </Form>

                  {/* Already registered? */}
                  <div className="mt-8 pt-8 border-t-2 border-black">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground font-bold tracking-wide">
                        Already have an account?{" "}
                        <button
                          type="button"
                          onClick={() => { setActiveTab("login"); setAuthView("login"); }}
                          className="text-black underline underline-offset-2 hover:text-primary transition-colors"
                          data-testid="button-switch-to-login"
                        >
                          LOGIN →
                        </button>
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="login" className="space-y-6 md:space-y-8 overflow-visible min-h-[auto] w-full">
                  <div className="max-w-[480px] mx-auto w-full space-y-6 md:space-y-8">
                    <Form {...loginForm}>
                      <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6 md:space-y-8 overflow-visible">
                        <FormField
                          control={loginForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Email Address</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    {...field}
                                    type="email"
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4"
                                    data-testid="input-login-email"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-0 flex items-center px-4 pointer-events-none">
                                      <AnimatedPlaceholder examples={['john@gmail.com', 'user@thorx.com', 'earner@example.com']} />
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={loginForm.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem className="space-y-2">
                              <FormLabel className="block p-0 m-0 border-none shadow-none bg-transparent">
                                <FieldTag>Security Password</FieldTag>
                              </FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input
                                    type={showPassword ? "text" : "password"}
                                    {...field}
                                    className="border-2 border-black text-base md:text-lg py-3 md:py-4 px-4 pr-12"
                                    data-testid="input-login-password"
                                  />
                                  {!field.value && (
                                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none pr-12">
                                      <AnimatedPlaceholder examples={['Enter your password', 'Your secure password', 'Login password']} />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 p-1.5 rounded-sm hover:bg-muted/50 transition-all duration-200 group"
                                    data-testid="button-toggle-login-password"
                                  >
                                    {showPassword ? (
                                      <EyeOff className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    ) : (
                                      <Eye className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    )}
                                  </button>
                                </div>
                              </FormControl>
                              <FormMessage className="mt-2" />
                            </FormItem>
                          )}
                        />

                        {/* Forgot Password */}
                        <div className="text-right">
                          <button
                            type="button"
                            className="text-primary hover:text-black transition-colors font-semibold text-sm border-b border-primary hover:border-black"
                            onClick={() => {
                              setForgotEmail('');
                              setForgotStep(1);
                              setAuthView('forgot-password');
                            }}
                            data-testid="button-forgot-password"
                          >
                            FORGOT PASSWORD?
                          </button>
                        </div>

                        <div className="pt-4">
                          <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-primary text-white text-lg md:text-xl font-black py-4 md:py-5 hover:bg-black transition-colors border-2 border-black disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid="button-login-submit"
                          >
                            {isSubmitting ? (
                              <><Loader2 className="mr-2 h-5 w-5 animate-spin inline" />LOGGING IN</>
                            ) : "Enter"}
                          </Button>
                        </div>
                      </form>
                    </Form>

                    {/* Direct Portal Access */}
                    <div className="mt-8 pt-8 border-t-2 border-black">
                      <div className="text-center space-y-5">
                        <TechnicalLabel text="OR NAVIGATE TO PORTAL" className="text-muted-foreground" />
                        <div className="grid grid-cols-2 gap-4 md:gap-5">
                          <Button
                            onClick={() => setLocation("/portal")}
                            variant="outline"
                            className="w-full border-2 border-primary text-primary hover:bg-primary hover:text-white text-base md:text-lg font-black py-3 md:py-4"
                            data-testid="button-user-portal"
                          >
                            USER PORTAL →
                          </Button>
                          <Button
                            onClick={() => setLocation("/team")}
                            variant="outline"
                            className="w-full border-2 border-black text-black hover:bg-black hover:text-white text-base md:text-lg font-black py-3 md:py-4"
                            data-testid="button-team-portal"
                          >
                            TEAM PORTAL →
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              )}

              {/* Security Badge */}
              <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t-2 border-black">
                <div className="flex items-center justify-center space-x-2 md:space-x-4">
                  <Barcode variant="bold" className="w-12 md:w-16 h-3 md:h-4" />
                </div>
              </div>

              {/* Legal Links */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="text-center text-xs text-muted-foreground">
                  <p className="mb-2">By continuing, you agree to our</p>
                  <div className="flex items-center justify-center gap-3">
                    <a
                      href="/terms"
                      className="text-black hover:text-primary font-semibold underline underline-offset-2 transition-colors"
                    >
                      Terms & Conditions
                    </a>
                    <span className="text-gray-300">|</span>
                    <a
                      href="/privacy"
                      className="text-black hover:text-primary font-semibold underline underline-offset-2 transition-colors"
                    >
                      Privacy Policy
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div >
      </section >
    </motion.div >
  );
}
