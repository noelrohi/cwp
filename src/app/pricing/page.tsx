"use client";

// interface Subscription {
//   productId: string;
//   status: string;
// }

export default function PricingPage() {
  return null;
  // const { customer, attach, openBillingPortal } = useCustomer();

  // const plans = [
  //   {
  //     name: "Free",
  //     price: "$0",
  //     description: "Perfect for trying out the platform",
  //     features: [
  //       "500 questions per month",
  //       "Basic podcast library access",
  //       "Standard response quality",
  //       "Community support",
  //     ],
  //     productId: "free",
  //     popular: false,
  //   },
  //   {
  //     name: "Pro",
  //     price: "$19",
  //     description: "For power users and professionals",
  //     features: [
  //       "Unlimited questions",
  //       "Full podcast library access",
  //       "Premium response quality",
  //       "Priority support",
  //       "Advanced features",
  //       "Early access to new features",
  //     ],
  //     productId: "pro",
  //     popular: true,
  //   },
  // ];

  // const handleUpgrade = async (productId: string) => {
  //   await attach({
  //     productId,
  //     dialog: CheckoutDialog,
  //   });
  // };

  // const handleManageBilling = async () => {
  //   await openBillingPortal({
  //     returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
  //   });
  // };

  // console.log({ customer });

  // const isSubscribedToPro = customer?.products.some((p) => p.id === "pro");

  // return (
  //   <div className="container mx-auto px-4 py-8">
  //     <div className="text-center mb-12">
  //       <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
  //       <p className="text-xl text-muted-foreground">
  //         Select the perfect plan for your needs. Upgrade or downgrade at any
  //         time.
  //       </p>
  //     </div>

  //     <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
  //       {plans.map((plan) => (
  //         <Card
  //           key={plan.productId}
  //           className={`relative ${plan.popular ? "border-primary shadow-lg" : ""}`}
  //         >
  //           {plan.popular && (
  //             <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
  //               <div className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium flex items-center gap-1">
  //                 <Star className="w-4 h-4" />
  //                 Most Popular
  //               </div>
  //             </div>
  //           )}

  //           <CardHeader className="text-center">
  //             <CardTitle className="text-2xl">{plan.name}</CardTitle>
  //             <CardDescription>{plan.description}</CardDescription>
  //             <div className="mt-4">
  //               <span className="text-4xl font-bold">{plan.price}</span>
  //               <span className="text-muted-foreground">/month</span>
  //             </div>
  //           </CardHeader>

  //           <CardContent className="space-y-4">
  //             <ul className="space-y-2">
  //               {plan.features.map((feature, index) => (
  //                 <li key={index} className="flex items-center gap-2">
  //                   <Check className="w-4 h-4 text-green-500" />
  //                   <span>{feature}</span>
  //                 </li>
  //               ))}
  //             </ul>

  //             <Button
  //               className="w-full mt-6"
  //               variant={plan.popular ? "default" : "outline"}
  //               onClick={() => {
  //                 if (plan.productId === "free") {
  //                   // Free plan doesn't need action
  //                   return;
  //                 }

  //                 if (isSubscribedToPro) {
  //                   handleManageBilling();
  //                 } else {
  //                   handleUpgrade(plan.productId);
  //                 }
  //               }}
  //             >
  //               {plan.productId === "free"
  //                 ? customer
  //                   ? "Current Plan"
  //                   : "Current Plan"
  //                 : isSubscribedToPro
  //                   ? "Manage Billing"
  //                   : `Upgrade to ${plan.name}`}
  //             </Button>
  //           </CardContent>
  //         </Card>
  //       ))}
  //     </div>

  //     {customer && (
  //       <div className="mt-12 text-center">
  //         <div className="bg-muted rounded-lg p-6 max-w-2xl mx-auto">
  //           <h3 className="text-lg font-semibold mb-2">Your Current Status</h3>
  //           <p className="text-sm text-muted-foreground mb-4">
  //             {isSubscribedToPro
  //               ? "You're currently on the Pro plan"
  //               : "You're currently on the Free plan"}
  //           </p>
  //           {isSubscribedToPro && (
  //             <Button variant="outline" onClick={handleManageBilling}>
  //               Manage Subscription
  //             </Button>
  //           )}
  //         </div>
  //       </div>
  //     )}
  //   </div>
  // );
}
