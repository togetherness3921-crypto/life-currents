import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <div className="fixed left-4 top-1/2 -translate-y-1/2 text-yellow-400 text-3xl font-bold drop-shadow pointer-events-none z-[9999]">
        Inserted to test
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
