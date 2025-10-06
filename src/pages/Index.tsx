import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex w-48 items-center justify-center bg-black p-4 text-lg font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
