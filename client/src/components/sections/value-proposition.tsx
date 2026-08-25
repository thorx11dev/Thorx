import TechnicalLabel from "@/components/ui/technical-label";
import { RulerCarousel } from "@/components/ui/ruler-carousel";
import TextBlockAnimation from "@/components/ui/text-block-animation";
import SectionHeader from "@/components/sections/section-header";

interface ContentBlockProps {
    label: string;
    description: string;
    isActive: boolean;
}

const ContentBlock = ({ label, description, isActive }: ContentBlockProps) => (
    <div className="flex flex-col gap-6 md:gap-8 p-6 md:p-10 h-full bg-white transition-colors duration-300 hover:bg-[#FFFCF6]">
        <div className="w-fit">
            <div className="rounded-md bg-black px-2.5 py-1.5">
                <TechnicalLabel
                    text={label}
                    className="text-white font-semibold tracking-[0.2em] text-[9px] md:text-[10px]"
                />
            </div>
        </div>
        <TextBlockAnimation blockColor="#0a0a0a" delay={0.15} duration={0.4} animateOnScroll={false} trigger={isActive}>
            <p className="text-base md:text-lg text-black/70 leading-relaxed font-medium">
                {description}
            </p>
        </TextBlockAnimation>
    </div>
);

export default function ValueProposition({ isActive }: { isActive: boolean }) {
    const stakeholders = [
        {
            label: "FOR EARNERS",
            description: "Turn genuine attention into real rewards — no hidden deductions, no surprises. Our Net-First wallet always shows exactly what you can withdraw. Watch verified ads, complete curated tasks, build a referral team, and withdraw directly to your account."
        },
        {
            label: "FOR ADVERTISERS",
            description: "Get verified human attention, not bot impressions. Every THORX ad view passes a dual-phase behavioral check — video completion plus 15 seconds of active page exploration tracked by our hidden AI detector. Reach a real, engaged Pakistani audience and pay only for verified engagement."
        },
        {
            label: "FOR THE ECOSYSTEM",
            description: "THORX is infrastructure. Our 3-Division Referral Matrix turns every user into an organic growth engine. Our AI fraud stack eliminates fake traffic at every layer. And our LeadX system bridges attention and lead generation — creating a self-sustaining, trusted marketplace for human attention."
        }
    ];

    return (
        <section
            className={`cinematic-section ${isActive ? 'active' : ''}`}
            data-section="3"
            data-testid="value-proposition-section"
        >
            <div className="mx-auto w-full max-w-[1440px] pt-4 md:pt-8 pb-10 md:pb-16">
                <SectionHeader
                    index="03"
                    label="STAKEHOLDERS"
                    countLabel="03 DIVISIONS"
                    title="VALUE PROPOSITION"
                    isActive={isActive}
                />

                {/* Precision hairline panel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-px rounded-2xl border border-black/10 bg-black/10 overflow-hidden mb-10 md:mb-14">
                    {stakeholders.map((stakeholder) => (
                        <ContentBlock key={stakeholder.label} {...stakeholder} isActive={isActive} />
                    ))}
                </div>

                {/* Ruler Carousel */}
                <div className="border-t border-black/10 pt-8 md:pt-12">
                    <RulerCarousel
                        originalItems={[
                            { id: 1, title: "EARN" },
                            { id: 2, title: "TEAM" },
                            { id: 3, title: "FAST" },
                            { id: 4, title: "24/7" },
                        ]}
                    />
                </div>
            </div>
        </section>
    );
}
