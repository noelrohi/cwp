import { scoreWithHeuristics } from "@/server/lib/hybrid-heuristics";

const testCases = {
  shouldPass: [
    {
      name: "Pricing strategy discussion",
      content:
        "We discussed pricing strategies and AI pricing models in depth. Dynamic pricing is changing retail fundamentally, allowing companies to optimize revenue in real-time based on demand signals. The pricing power of strong brands allows premium positioning in the market. What's interesting is how pricing becomes a strategic lever rather than just a tactical decision. Companies that master pricing psychology can charge 20-30% more than competitors without losing market share. The key is understanding customer willingness to pay and matching that with value perception.",
    },
    {
      name: "Excited to share insight",
      content:
        "I'm excited to share this counter-intuitive framework about customer acquisition that we've developed over the past five years. The key insight is that simplification drives adoption more than feature additions, which goes against conventional wisdom in product development. Most founders think they need to add more features to compete, but what actually happens is feature bloat creates confusion and reduces conversion rates. By stripping away unnecessary complexity and focusing on core value propositions, companies can increase adoption by 40-50%. This framework helped us grow from zero to ten million in annual recurring revenue.",
    },
    {
      name: "Episode summary",
      content:
        "In this episode, they discussed revenue models and business strategy in the context of modern SaaS companies. The conversation covered pricing power, brand differentiation, and market positioning dynamics across various industries. They explored how companies transition from usage-based pricing to value-based pricing as they mature. The discussion also touched on customer lifetime value calculations and how to optimize pricing tiers for different customer segments. Key takeaway was that pricing is not just about covering costs but about capturing the value you create for customers.",
    },
    {
      name: "Conference announcement (not CTA)",
      content:
        "She announced her findings at the conference last week in San Francisco. The research showed that companies with strong culture outperform by 20% over five years, which validates what many founders have believed intuitively but couldn't prove quantitatively. The study analyzed over 500 companies across different industries and controlled for market conditions, funding levels, and competitive dynamics. What made the research compelling was the methodology used to measure culture objectively rather than relying on surveys or anecdotal evidence. The framework they developed could be a game-changer for how we think about organizational design.",
    },
    {
      name: "Delta AI pricing discussion (original bug)",
      content:
        "Yeah. Well one of those is technology and the AI race. By the way, we like to refer to AI not as artificial intelligence but as augmented intelligence. I think if more people started talking about as augmented intelligence it would take a lot of the fear and the trepidation and the mystery out of what's being done out there. The reason I say augmented it's really helping our people to do a better job serving our customers. Whether that's figuring out, you know, the turbulence in the sky and using technologies to better map and plot a route destination, having more signals available, whether it's Delta Concierge, which is our latest that we're rolling out in terms of our app, where we have, essentially an agentic framework where you're getting the more you feed into your own personal app and experience, the more that's going to come to you in terms of opportunities or what you want to experience when you're on the ground or what we can do to help you. Not necessarily what we're there to sell you, which is I think that's one of the dangers of this. We're there to help you. We got caught in a little with thinking about some storms, recent storm AI pricing.",
    },
    {
      name: "Built product mention (no URL)",
      content:
        "That's why we built a system that prioritizes customer feedback loops at every stage of product development. The framework helps teams iterate faster without losing quality or coherence in the product experience. What makes it different from traditional agile methodologies is the emphasis on continuous customer validation rather than sprint-based planning. Teams using this framework report 30-40% faster iteration cycles while maintaining higher customer satisfaction scores. The key innovation was creating tight feedback loops that surface customer pain points before they become major issues requiring rework.",
    },
    {
      name: "Subscribe discussion (not CTA)",
      content:
        "The subscribe button psychology is fascinating when you look at the data. Why do some creators get higher subscribe rates even with similar content quality? It's about delivering consistent value that creates habit formation in viewers. The best creators understand that subscription is a trust signal - people subscribe when they believe future content will be as valuable as what they just watched. This means the call to subscribe should come after delivering massive value, not before. Timing and context matter more than the number of times you ask. Creators who remind viewers of past value when asking for subscriptions see conversion rates two to three times higher.",
    },
  ],
  shouldFailAds: [
    {
      name: "Clear CTA",
      content:
        "Check out our new product at example.com. Sign up now to get started today with exclusive features.",
    },
    {
      name: "Pricing CTA",
      content:
        "Our plans starting at $99/month give you everything you need. Visit our site to learn more.",
    },
    {
      name: "Sponsorship",
      content:
        "This episode is brought to you by our sponsor, TechCorp. They help businesses scale efficiently.",
    },
    {
      name: "URL with path",
      content:
        "You can find more information at example.com/pricing or visit our website for details.",
    },
    {
      name: "Event CTA",
      content:
        "Register now for our conference. Save your spot today and join us at this incredible event.",
    },
    {
      name: "Product pitch with URL",
      content:
        "That's why we built framework.io to solve this problem. Try it free today.",
    },
    {
      name: "Subscribe newsletter CTA",
      content:
        "Subscribe to our newsletter to get weekly insights delivered to your inbox.",
    },
  ],
  shouldFailIntro: [
    {
      name: "Episode intro",
      content:
        "Thanks for tuning in! Enjoy the episode and let's dive right in to today's conversation.",
    },
    {
      name: "Social media CTA",
      content:
        "Hit the like button and subscribe to the channel. Links in the description below.",
    },
    {
      name: "Outro pleasantries",
      content:
        "Thanks for having me on the show. Glad to be here and hope you enjoyed this conversation.",
    },
    {
      name: "Show notes CTA",
      content:
        "Check out the show notes for all the links we mentioned. See you next week!",
    },
  ],
};

function runTests() {
  console.log("=".repeat(80));
  console.log("HEURISTIC FILTER TEST SUITE");
  console.log("=".repeat(80));

  let totalTests = 0;
  let passed = 0;
  let failed = 0;

  // Test: Should PASS (not ads/intros)
  console.log("\n📝 Testing legitimate content (should PASS to LLM):");
  console.log("-".repeat(80));

  for (const test of testCases.shouldPass) {
    totalTests++;
    const result = scoreWithHeuristics(test.content);
    const didPass = !result.fail; // fail=false means it passed to LLM

    if (didPass) {
      passed++;
      console.log(`✅ ${test.name}`);
      console.log(`   Score: ${result.score}% (sent to LLM)`);
    } else {
      failed++;
      console.log(`❌ ${test.name}`);
      console.log(`   Score: ${result.score}% (BLOCKED)`);
      console.log(`   Reason: ${result.buckets.reasons.join(", ")}`);
      console.log(`   Content: ${test.content.substring(0, 100)}...`);
    }
  }

  // Test: Should FAIL as ads
  console.log("\n🚫 Testing ad content (should FAIL):");
  console.log("-".repeat(80));

  for (const test of testCases.shouldFailAds) {
    totalTests++;
    const result = scoreWithHeuristics(test.content);
    const didFail = result.fail; // fail=true means it was blocked

    if (didFail) {
      passed++;
      console.log(`✅ ${test.name}`);
      console.log(`   Score: ${result.score}% (correctly blocked as ad)`);
      console.log(`   Reason: ${result.buckets.reasons.join(", ")}`);
    } else {
      failed++;
      console.log(`❌ ${test.name}`);
      console.log(`   Score: ${result.score}% (FALSE NEGATIVE - should block)`);
      console.log(`   Content: ${test.content.substring(0, 100)}...`);
    }
  }

  // Test: Should FAIL as intro/outro
  console.log("\n🎬 Testing intro/outro content (should FAIL):");
  console.log("-".repeat(80));

  for (const test of testCases.shouldFailIntro) {
    totalTests++;
    const result = scoreWithHeuristics(test.content);
    const didFail = result.fail;

    if (didFail) {
      passed++;
      console.log(`✅ ${test.name}`);
      console.log(
        `   Score: ${result.score}% (correctly blocked as intro/outro)`,
      );
      console.log(`   Reason: ${result.buckets.reasons.join(", ")}`);
    } else {
      failed++;
      console.log(`❌ ${test.name}`);
      console.log(`   Score: ${result.score}% (FALSE NEGATIVE - should block)`);
      console.log(`   Content: ${test.content.substring(0, 100)}...`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total tests: ${totalTests}`);
  console.log(
    `Passed: ${passed} (${((passed / totalTests) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Failed: ${failed} (${((failed / totalTests) * 100).toFixed(1)}%)`,
  );

  if (failed === 0) {
    console.log(
      "\n🎉 All tests passed! Heuristic filters are working correctly.",
    );
  } else {
    console.log(
      `\n⚠️  ${failed} test(s) failed. Review false positives/negatives above.`,
    );
  }
}

runTests();
