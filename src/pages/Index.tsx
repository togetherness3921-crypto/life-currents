import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden bg-background">
      <div className="flex min-w-[220px] items-center justify-center bg-black p-6 text-2xl font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
