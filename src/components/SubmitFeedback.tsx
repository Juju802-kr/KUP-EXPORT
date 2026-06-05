"use client";

import { useEffect } from "react";

const processingMessage = "\ucc98\ub9ac \uc694\uccad\uc774 \uc811\uc218\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uc644\ub8cc\ub418\uba74 \uc548\ub0b4\ucc3d\uc774 \ub2e4\uc2dc \ud45c\uc2dc\ub429\ub2c8\ub2e4.";

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
        alert(processingMessage);
      }, 0);
    }

    document.addEventListener("submit", handleSubmit);
    return () => document.removeEventListener("submit", handleSubmit);
  }, []);

  return null;
}
