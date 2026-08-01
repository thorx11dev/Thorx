interface NavigationProgressProps {
  currentSection: number;
  totalSections: number;
  onSectionChange: (section: number) => void;
}

export default function NavigationProgress({ currentSection, totalSections, onSectionChange }: NavigationProgressProps) {
  return (
    <div className="navigation-progress" data-testid="navigation-progress">
      <div className="flex space-x-4">
        {Array.from({ length: totalSections }, (_, index) => (
          <button
            key={index + 1}
            onClick={() => onSectionChange(index + 1)}
            className={`progress-dot focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${currentSection === index + 1 ? 'active' : ''}`}
            data-testid={`progress-dot-${index + 1}`}
            aria-label={`Go to section ${index + 1}`}
            aria-current={currentSection === index + 1 ? 'true' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
