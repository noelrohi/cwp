/**
 * Debug single chunk to see why heuristics are failing
 */

const content = `We call that hyperfluency. Sometimes, like you hear people talk about an idea maze referring to the history of the industry, why earlier attempts have failed, why, you know, their attempt is going to succeed. It's like the people with hyperfluency talk about this in such a way that it's like something we hear. So we live and die as a fund by our ability to identify people. Ultimately, it's going to come down to an intuitive judgment, and I think it is a tacit knowledge where we trained on the Thiel Fellowship, we developed our pattern recognition, and now we find new cases, and there's like this computer vision. You know, is this person a creative founder or not? And we just have to sort of use that recognition there. But when you ask me to articulate it, give some recipe, I think our words are always going to fall short. It's almost like a virtue theory in moral philosophy, where what makes a good person? I think we should be asking what makes the right stuff in a lot of different domains. It's not just like GPA or like how you, you know, your essay grades. There's just like something about there are virtues we're not cultivating as a society.`;

const wordCount = content.trim().split(/\s+/).length;
console.log(`Word count: ${wordCount}`);
console.log();

// Test each pattern
console.log("=== FRAMEWORK DETECTION ===");
console.log(
  `Named concept (we call this): ${/\b(we call (this|that|it)|this is called|known as|referred to as|term for)\b/i.test(content)}`,
);
console.log(
  `Quoted concept: ${/"[A-Z][a-z]+(\s[A-Z][a-z]+)*"/g.test(content)}`,
);
console.log(
  `VS pattern: ${/\b\w+\s+(vs\.?|versus|compared to|rather than|instead of)\s+\w+/i.test(content)}`,
);
console.log(
  `Framework marker: ${/\b(framework|model|pattern|principle|law|rule|playbook|system)\b/i.test(content)}`,
);
console.log();

console.log("=== INSIGHT DENSITY ===");
console.log(
  `Contrarian: ${/\b(but actually|but really|however|contrary to|opposite|paradox|irony|counterintuitively)\b/i.test(content)}`,
);
console.log(
  `Causal: ${/\b(because|therefore|thus|hence|leads to|causes|results in|if .+ then)\b/i.test(content)}`,
);
const negations =
  content.match(/\b(not|never|nobody|nothing|isn't|doesn't|won't|can't)\b/gi) ||
  [];
console.log(`Negations: ${negations.length} - ${negations.join(", ")}`);
console.log();

console.log("=== SPECIFICITY ===");
console.log(
  `Numbers: ${/\d+([.,]\d+)?(%|x|X|\s*(percent|million|billion|thousand))?/.test(content)}`,
);
console.log(
  `Proper nouns: ${/\b[A-Z][a-z]+(\s[A-Z][a-z]+)*\b/g.test(content)}`,
);
console.log(
  `Steps: ${/\b(first|second|third|step|stage|phase)\b/i.test(content)}`,
);
console.log(
  `Examples: ${/\b(for example|for instance|such as|like when|imagine)\b/i.test(content)}`,
);

console.log("\n" + "=".repeat(80));
console.log("ANALYSIS:");
console.log("This chunk has:");
console.log("  • 'We call that hyperfluency' - NAMED FRAMEWORK ✓");
console.log("  • 'idea maze' - FRAMEWORK REFERENCE ✓");
console.log("  • 'pattern recognition' - FRAMEWORK MARKER ✓");
console.log("  • Multiple NOT statements - CHALLENGING ASSUMPTIONS ✓");
console.log("  • 'Thiel Fellowship' - PROPER NOUN EXAMPLE ✓");
console.log("  • Counter-cultural take (society not cultivating virtues) ✓");
console.log();
console.log("This is a PERFECT example of what Usman saves!");
console.log("Heuristics should score this 70-80+");
