const hre = require("hardhat")

async function main() {
  console.log("🌸 Deploying Floracore contracts to Avalanche Fuji Testnet...\n")

  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners()
  console.log("Deploying contracts with account:", deployer.address)
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString())
  console.log("")

  // Deploy OfficialRegistry
  console.log("📋 Deploying OfficialRegistry...")
  const OfficialRegistry = await hre.ethers.getContractFactory("OfficialRegistry")
  const registry = await OfficialRegistry.deploy()
  await registry.waitForDeployment()
  const registryAddress = await registry.getAddress()
  console.log("✅ OfficialRegistry deployed to:", registryAddress)
  console.log("")

  // Deploy FloracoreSBT
  console.log("🐾 Deploying FloracoreSBT...")
  const FloracoreSBT = await hre.ethers.getContractFactory("FloracoreSBT")
  const sbt = await FloracoreSBT.deploy(registryAddress)
  await sbt.waitForDeployment()
  const sbtAddress = await sbt.getAddress()
  console.log("✅ FloracoreSBT deployed to:", sbtAddress)
  console.log("")

  // Deploy FloracoreRecords
  console.log("📝 Deploying FloracoreRecords...")
  const FloracoreRecords = await hre.ethers.getContractFactory("FloracoreRecords")
  const records = await FloracoreRecords.deploy(registryAddress, sbtAddress)
  await records.waitForDeployment()
  const recordsAddress = await records.getAddress()
  console.log("✅ FloracoreRecords deployed to:", recordsAddress)
  console.log("")

  // Summary
  console.log("🎉 Deployment Summary:")
  console.log("========================")
  console.log("OfficialRegistry:", registryAddress)
  console.log("FloracoreSBT:", sbtAddress)
  console.log("FloracoreRecords:", recordsAddress)
  console.log("")
  console.log("💡 Next steps:")
  console.log("1. Add authorized veterinarians using OfficialRegistry.addVeterinarian()")
  console.log("2. Update frontend with these contract addresses")
  console.log("3. Verify contracts on Snowtrace (optional)")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
