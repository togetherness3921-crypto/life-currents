import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex w-60 items-center justify-center bg-black">
        <span className="text-xl font-semibold text-yellow-300">Inserted to test</span>
      </div>
      <div className="h-full flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
