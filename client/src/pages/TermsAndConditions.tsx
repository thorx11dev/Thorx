import { motion } from "framer-motion";
import { ShieldCheck, Scale, AlertTriangle, Users, Wallet, CheckCircle2 } from "lucide-react";
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

export default function TermsAndConditions() {
    const lastUpdated = "January 29, 2026";
    const [activeId, setActiveId] = useState("overview");
    const [triggers, setTriggers] = useState<Record<string, number>>({});

    const sections = [
        { id: "overview", label: "Overview" },
        { id: "earning-model", label: "Earning Model" },
        { id: "30s-rule", label: "30s Rule" },
        { id: "rankings", label: "Rankings" },
        { id: "payments", label: "Payments" },
        { id: "prohibited", label: "Prohibited" }
    ];

    const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        setActiveId(id);

        // Force force update trigger for the target section
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
            <LegalNav docLabel="TERMS" />

            <main className="max-w-5xl mx-auto px-6 pt-32 pb-24">
                <div className="mb-20">
                    <TextBlockAnimation blockColor="#D97757" duration={0.8} animateOnScroll={false}>
                        <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-none mb-6">
                            Terms <br /> & Conditions<span className="text-primary">.</span>
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
                                    data-testid={`link-terms-toc-${item.id}`}
                                >
                                    {item.label}
                                </a>
                            ))}
                        </nav>
                    </aside>

                    <div className="lg:col-span-9">
                        <Section title="1. Platform Overview" id="overview" icon={ShieldCheck} trigger={triggers["overview"]}>
                            <p>
                                THORX (thorx.pro) is an industrial-grade earning platform designed specifically for the Pakistani market.
                                Our mission is to provide a sustainable, transparent, and Halal income opportunity by converting
                                human attention into digital currency (PKR).
                            </p>
                            <p className="mt-4">
                                By registering an account, you agree to participate in an ecosystem where genuine engagement
                                directly correlates with financial reward.
                            </p>
                        </Section>

                        <Section title="2. The Halal Earning Model" id="earning-model" icon={CheckCircle2} trigger={triggers["earning-model"]}>
                            <p>
                                We operate on a strict Halal-based model. All advertisements served through the THORX Ads Player
                                follow guidelines to ensure no prohibited or inappropriate material is promoted.
                            </p>
                            <ul className="list-none space-y-4 mt-6">
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">01</span>
                                    <span>Watching video advertisements attentively via the THORX Ads Player.</span>
                                </li>
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">02</span>
                                    <span>Visiting and interacting with advertiser product pages through the THORX Web Panel.</span>
                                </li>
                                <li className="flex gap-4">
                                    <span className="font-black text-primary">03</span>
                                    <span>Expanding the community via our Multi-Level Referral System.</span>
                                </li>
                            </ul>
                        </Section>

                        <Section title="3. The 30-Second Engagement Rule" id="30s-rule" icon={Scale} trigger={triggers["30s-rule"]}>
                            <div className="bg-muted rounded-xl p-8 border-l-4 border-primary">
                                <p className="font-bold text-lg mb-4 text-black">Attention is the required stake.</p>
                                <p>
                                    To successfully complete an ad task, users must remain on the advertiser's product page for
                                    <strong> approximately 30 seconds</strong>. This period must involve active reading and scrolling.
                                    Tasks without documented real interaction will not be converted into earnings.
                                </p>
                            </div>
                        </Section>

                        <Section title="4. Ranking & Referrals" id="rankings" icon={Users} trigger={triggers["rankings"]}>
                            <p className="mb-6">
                                THORX uses a Performance Score (PS) system to determine user rank. PS is earned by
                                completing Engine A, B, and C tasks — higher ranks unlock additional platform features.
                                No referral counts or earnings thresholds are required to advance.
                            </p>

                            <div className="overflow-x-auto border border-black/10 rounded-xl mb-8">
                                <table className="w-full text-left text-xs uppercase tracking-tighter">
                                    <thead className="bg-muted border-b border-black/10">
                                        <tr>
                                            <th className="p-4 font-black">Rank</th>
                                            <th className="p-4 font-black">PS Required</th>
                                            <th className="p-4 font-black">TX-Points Multiplier</th>
                                            <th className="p-4 font-black">Key Unlocks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/10">
                                        {[
                                            { r: "E-Rank", ps: "0",      mult: "1.00×", unlock: "Engine A access · daily streak bonus"                                   },
                                            { r: "D-Rank", ps: "1,000",  mult: "1.10×", unlock: "Higher TX-Points multiplier"                                              },
                                            { r: "C-Rank", ps: "3,000",  mult: "1.20×", unlock: "Engine B paid surveys"                                              },
                                            { r: "B-Rank", ps: "6,000",  mult: "1.35×", unlock: "Join guilds that require B-Rank or higher"                                 },
                                            { r: "A-Rank", ps: "10,000", mult: "1.50×", unlock: "Wider Thorx Card variance (±5%)"                                         },
                                            { r: "S-Rank", ps: "20,000", mult: "1.75×", unlock: "Instant withdrawal approval · widest Thorx Card variance (±10%)"            },
                                        ].map((row) => (
                                            <tr key={row.r} className="hover:bg-muted/60 transition-colors">
                                                <td className="p-4 font-bold">{row.r}</td>
                                                <td className="p-4">{row.ps}</td>
                                                <td className="p-4">{row.mult}</td>
                                                <td className="p-4">{row.unlock}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className="text-sm">
                                <strong className="text-black">How ranks affect earnings:</strong> the multiplier applies to the
                                TX-Points (display points) you earn per task — it never changes the real PKR value your earnings
                                convert to at withdrawal. Guild creation is open to members of every rank; each request is
                                reviewed and approved by an admin. Referral tracking is available from day one at any rank.
                            </p>

                            <p className="italic text-sm">
                                Referral Commission: THORX operates a single-tier referral system. When a user you referred
                                makes a withdrawal, a share of the platform's 15% withdrawal fee is credited to your
                                Referral Cash Balance as real PKR. There are no Level 2 or multi-tier splits.
                            </p>
                        </Section>

                        <Section title="5. Payouts" id="payments" icon={Wallet} trigger={triggers["payments"]}>
                            <p>
                                Payouts are facilitated through <strong>JazzCash</strong> and <strong>EasyPaisa</strong>.
                                Withdrawals are open at any time — no daily task completion is required to qualify.
                                A flat 15% platform fee is deducted from each payout; the exact breakdown is shown on
                                the preview screen before you confirm. S-Rank users receive instant auto-approval on
                                every withdrawal request.
                            </p>
                        </Section>

                        <Section title="6. Prohibited Actions" id="prohibited" icon={AlertTriangle} trigger={triggers["prohibited"]}>
                            <div className="space-y-6">
                                <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5 text-red-600">
                                    <h4 className="font-black mb-2 uppercase tracking-widest text-sm">Strict Zero-Tolerance</h4>
                                    <p className="text-sm">
                                        The use of bots, headless browsers, or any method to bypass attentive interaction is
                                        strictly prohibited. If our system detects non-attentive engagement, generated earnings
                                        will be categorized as "Haram" and the account will be permanently banned.
                                    </p>
                                </div>
                                <p>
                                    Each user is permitted only one (1) unique Identity. Multiple account creation or
                                    identity manipulation will result in immediate termination of all associated profiles.
                                </p>
                            </div>
                        </Section>

                        <footer className="mt-24 pt-12 border-t border-black/10 text-[10px] font-bold tracking-[0.3em] uppercase opacity-40">
                            Thorx Official Legal / Powered by Thorx.pro
                        </footer>
                    </div>
                </div>
            </main>
        </div>
    );
}
