import { CinematicBlockReveal } from "@/components/ui/cinematic-block-reveal";
import { RulerCarousel } from "@/components/ui/ruler-carousel";

interface ContentBlockProps {
    label: string;
    description: string;
}

const ContentBlock = ({ label, description }: ContentBlockProps) => (
    <div className="flex flex-col gap-5 p-7 md:p-10 h-full bg-[var(--ed-surface-white,#fffefb)]">
        <div className="w-fit">
            <span className="thx-chip">{label}</span>
        </div>
        <p className="text-[15px] md:text-[17px] leading-relaxed text-[var(--ed-body-strong,#252523)] font-normal">
            {description}
        </p>
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
            className={`cinematic-section ${isActive ? 'active' : ''} bg-[var(--ed-canvas,#faf9f5)] pt-40 md:pt-[280px] pb-24 px-4 flex flex-col items-start justify-start overflow-y-auto`}
            data-section="3"
            data-testid="value-proposition-section"
        >
            <div className="mx-auto w-full max-w-[1200px]">
                {/* Section Header */}
                <div className="mb-12 md:mb-16">
                    <CinematicBlockReveal trigger={isActive} blockColor="#181715">
                        <p className="thx-kicker mb-4">Value Proposition</p>
                        <h2 className="thx-display thx-display-2 max-w-3xl text-[var(--ed-ink,#141413)]">
                            Serious infrastructure for every stakeholder.
                        </h2>
                    </CinematicBlockReveal>
                </div>

                {/* Stakeholder panels — hairline grid */}
                <div className="rounded-2xl border border-[var(--ed-hairline,#e6dfd8)] overflow-hidden mb-12 md:mb-14 shadow-[0_1px_3px_rgba(20,20,19,0.05)]">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[var(--ed-hairline,#e6dfd8)]">
                        {stakeholders.map((stakeholder) => (
                            <ContentBlock key={stakeholder.label} {...stakeholder} />
                        ))}
                    </div>
                </div>

                {/* Ruler Carousel */}
                <div className="mt-6 md:mt-10 border-t border-[var(--ed-hairline,#e6dfd8)] pt-12 md:pt-16 -mx-4 px-0">
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
