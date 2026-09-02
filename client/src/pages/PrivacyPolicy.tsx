import { motion } from "framer-motion";
import { Shield, Eye, Lock, Database, UserCheck, Flame } from "lucide-react";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import LegalNav from "@/components/legal/LegalNav";
import { useState } from "react";

const Section = ({ title, icon: Icon, children, id, trigger }: { title: string, icon?: any, children: React.ReactNode, id?: string, trigger?: number }) => (
    <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-16 border-l-2 border-black pl-6 md:pl-10"
        id={id}
    >
        <div className="flex items-center gap-3 mb-6">
            {Icon && <Icon className="size-6 text-primary" />}
            <TextBlockAnimation blockColor="#D97757" animateOnScroll={false} trigger={trigger}>
                <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">{title}</h2>
            </TextBlockAnimation>
        </div>
        <div className="prose prose-zinc max-w-none text-muted-foreground font-medium leading-relaxed">
            {children}
        </div>
    </motion.section>
);

export default function PrivacyPolicy() {
    const lastUpdated = "January 29, 2026";
    const [activeId, setActiveId] = useState("data-architecture");
    const [triggers, setTriggers] = useState<Record<string, number>>({});

    const sections = [
        { id: "data-architecture", label: "Data Architecture" },
        { id: "engagement-tracking", label: "Tracking" },
        { id: "security", label: "Security" },
        { id: "identity", label: "Identity" },
        { id: "retention", label: "Retention" },
        { id: "rights", label: "Your Rights" }
    ];

    const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        setActiveId(id);

        setTriggers(prev => ({
            ...prev,
            [id]: (prev[id] || 0) + 1
        }));

        const element = document.getElementById(id);
        if (element) {
            const headerOffset = 100;
            const elementPosition = element.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF9F5] text-black font-sans selection:bg-primary selection:text-white">
            <LegalNav docLabel="PRIVACY" />

            <main className="max-w-5xl mx-auto px-6 pt-32 pb-24">
                <div className="mb-20">
                    <TextBlockAnimation blockColor="#D97757" duration={0.8} animateOnScroll={false}>
                        <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none mb-6">
                            Privacy <br /> Policy<span className="text-primary">.</span>
                        </h1>
                    </TextBlockAnimation>
                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold tracking-widest uppercase opacity-60">
                        <span>Version 2.0</span>
                        <span className="w-1 h-1 bg-black rounded-full"></span>
                        <span>Last Updated: {lastUpdated}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                    {/* Sidebar navigation for desktop */}
                    <aside className="hidden lg:block lg:col-span-3 sticky top-32 h-fit space-y-4">
                        <nav className="flex flex-col space-y-2 border-l border-black/10">
                            {sections.map((item) => (
                                <a
                                    key={item.id}
                                    href={`#${item.id}`}
                                    onClick={(e) => scrollToSection(e, item.id)}
                                    className={`pl-4 py-2 text-xs font-bold uppercase tracking-widest transition-all duration-300 border-l-2 -ml-[1px] ${activeId === item.id
                                        ? "text-primary border-primary opacity-100"
                                        : "text-foreground/50 border-transparent opacity-50 hover:opacity-100"
                                        }`}
                                    data-testid={`link-privacy-toc-${item.id}`}
                                >
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    </aside>

                    <div className="lg:col-span-9">
                        <Section title="1. Data Architecture" id="data-architecture" icon={Database} trigger={triggers["data-architecture"]}>
                            <p>
                                At THORX, we collect only the data necessary to facilitate a secure and fair earning ecosystem.
                                Our architecture is built to ensure that "Attention" is accurately tracked and rewarded.
                            </p>
                            <h4 className="text-black font-black mt-8 mb-4 uppercase text-xs tracking-widest">User-Provided Information</h4>
                            <p className="text-sm">
                                During registration, we collect your Full Name, Email Address, and Password.
                                Upon verification, a <strong>unique THORX Identity</strong> is generated for your profile.
                            </p>
                        </Section>

                        <Section title="2. Engagement Tracking" id="engagement-tracking" icon={Eye} trigger={triggers["engagement-tracking"]}>
                            <p>
                                To validate ad tasks and ensure Halal interaction, our system monitors specific engagement metrics:
                            </p>
                            <ul className="list-none space-y-4 mt-6">
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">01</span>
                                    <span><strong>Video Completion:</strong> Tracking if a video ad has been watched in full via the THORX Ads Player.</span>
                                </li>
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">02</span>
                                    <span><strong>Stay Duration:</strong> Verification of the 30-second interaction rule on product pages.</span>
                                </li>
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">03</span>
                                    <span><strong>Interaction Data:</strong> Scrolling and reading behavior to differentiate real human attention from automated bots.</span>
                                </li>
                            </ul>
                        </Section>

                        <Section title="3. Security & OTP" id="security" icon={Lock} trigger={triggers["security"]}>
                            <p>
                                Protecting your earnings is our priority. We implement <strong>Email-based OTP (One-Time Password)</strong>
                                verification for all secure actions, including registration and critical account changes.
                                All passwords are encrypted using industry-standard hashing protocols.
                            </p>
                        </Section>

                        <Section title="4. Identity Integrity" id="identity" icon={UserCheck} trigger={triggers["identity"]}>
                            <p>
                                Every user is assigned a singular THORX Identity. Our system periodically audits for
                                identity duplication or manipulation to maintain the integrity of the referral and ranking systems.
                            </p>
                        </Section>

                        <Section title="5. Data Retention" id="retention" icon={Shield} trigger={triggers["retention"]}>
                            <p>
                                Transactional data, including earning logs and payout histories via JazzCash/EasyPaisa,
                                are retained for the lifetime of your account to provide performance analytics within
                                your User Portal.
                            </p>
                        </Section>

                        <Section title="6. Your Rights" id="rights" icon={Flame} trigger={triggers["rights"]}>
                            <p>
                                You have the right to request a full transcript of your THORX Identity data or request
                                permanent account deletion through the Help section of your User Portal (Area Contact).
                            </p>
                        </Section>

                        <footer className="mt-24 pt-12 border-t border-black/10 text-[10px] font-bold tracking-[0.3em] uppercase opacity-40">
                            Thorx Data Privacy / Secure System Terminal
                        </footer>
                    </div>
                </div>
            </main>
        </div>
    );
}
