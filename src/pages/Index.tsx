import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden flex">
      <div className="flex-shrink-0 p-6 text-3xl font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
