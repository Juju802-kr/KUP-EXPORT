"use client";

import { useEffect } from "react";

export function SubmitFeedback() {
  useEffect(() => {
    function handleSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form || form.dataset.instantFeedback === "off") return;
      if (form.dataset.submitting === "1") {
        event.preventDefault();
        return;
      }

      setTimeout(() => {
        if (event.defaultPrevented || form.dataset.submitting === "1") return;
        form.dataset.submitting = "1";
        const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
        if (submitter) {
          submitter.disabled = true;
          submitter.dataset.originalText = submitter.textContent ?? "";
          submitter.textContent = "\ucc98\ub9ac \uc911...";
        }
      }, 0);
    }

    document.addEventListener("submit", handleSubmit);
    return () => document.removeEventListener("submit", handleSubmit);
  }, []);

  return null;
}
