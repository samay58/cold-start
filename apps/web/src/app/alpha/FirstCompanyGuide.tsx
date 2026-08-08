"use client";

import React, { useEffect, useState } from "react";

import styles from "./alpha.module.css";

const AUTO_ADVANCE_MS = 5200;

export const FIRST_COMPANY_STEPS = [
  {
    label: "Open a company site",
    copy: "Start with a company you are already curious about. Cold Start stays out of the way until you open it."
  },
  {
    label: "Open Cold Start",
    copy: "Click Cold Start in your browser toolbar. It reads the company you are on, not your browsing history."
  },
  {
    label: "Begin research",
    copy: "Choose Begin research. A sourced profile arrives beside the site, ready to read and share."
  }
] as const;

export function nextFirstCompanyStep(index: number) {
  return (index + 1) % FIRST_COMPANY_STEPS.length;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}

export function FirstCompanyGuide({
  lensRemaining,
  profileRemaining
}: {
  lensRemaining?: number | undefined;
  profileRemaining?: number | undefined;
}) {
  const [activeStep, setActiveStep] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const step = FIRST_COMPANY_STEPS[activeStep] ?? FIRST_COMPANY_STEPS[0]!;

  useEffect(() => {
    if (prefersReducedMotion) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveStep((currentStep) => nextFirstCompanyStep(currentStep));
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(timer);
  }, [prefersReducedMotion]);

  return (
    <section aria-labelledby="first-company-guide-title" className={styles.firstCompanyGuide}>
      <div className={styles.guideHeading}>
        <p className={styles.stateLabel}>Your first company</p>
        <h2 id="first-company-guide-title">Follow the browser.</h2>
      </div>

      <ol aria-label="First company walkthrough" className={styles.guideSteps}>
        {FIRST_COMPANY_STEPS.map((item, index) => (
          <li key={item.label}>
            <button
              aria-current={activeStep === index ? "step" : undefined}
              className={styles.guideStepButton}
              data-active={activeStep === index}
              onClick={() => setActiveStep(index)}
              type="button"
            >
              <span className={styles.guideStepIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <div aria-hidden="true" className={styles.guideViewer} data-step={activeStep}>
        <div className={styles.guideBrowserBar}>
          <span className={styles.guideBrowserDots} />
          <span className={styles.guideAddress}>linear.app</span>
          <span className={styles.guideToolbarButton}>Cold Start</span>
        </div>

        <div className={styles.guideWebsite}>
          <span className={styles.guideWebsiteMark}>L</span>
          <div>
            <strong>Linear</strong>
            <span>Product development, streamlined.</span>
          </div>
        </div>

        <div className={styles.guideSidepanel}>
          <div className={styles.guideSidepanelHead}>
            <span>Cold Start</span>
            <span>Linear</span>
          </div>
          <div className={styles.guideSidepanelBody}>
            <div className={styles.guidePanelBegin}>
              <span className={styles.guidePanelKicker}>Linear</span>
              <span className={styles.guidePanelAction}>Begin research</span>
            </div>
            <div className={styles.guidePanelFiled}>
              <div>
                <span className={styles.guidePanelKicker}>Linear</span>
                <strong>Source-backed profile</strong>
              </div>
              <span className={styles.guideFiledStamp}>FILED</span>
              <span className={styles.guideSourceLine}>6 sources held beside the read</span>
            </div>
          </div>
        </div>
      </div>

      <p className={styles.guideCopy}>{step.copy}</p>
      <p className={styles.guideTip}>Cannot see Cold Start? Open your browser&apos;s Extensions menu and pin it.</p>
      {profileRemaining !== undefined && lensRemaining !== undefined ? (
        <p className={styles.guideAllowance}>
          Your invitation has {profileRemaining} fresh profiles and {lensRemaining} Lens runs. Opening filed work is free.
        </p>
      ) : null}
      <a className={styles.primaryAction} href="https://linear.app" rel="noreferrer" target="_blank">
        Open Linear
      </a>
    </section>
  );
}
