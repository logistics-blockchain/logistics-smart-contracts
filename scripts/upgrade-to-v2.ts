import hre from 'hardhat'
import { createWalletClient, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { hardhat } from 'viem/chains'
import fs from 'fs'

async function main() {
  console.log('🚀 Starting upgrade to LogisticsOrderV2...\n')

  // Read deployment info to get proxy address
  const deploymentInfo = JSON.parse(
    fs.readFileSync('deployment-info.json', 'utf-8')
  )

  const proxyAddress = deploymentInfo.contracts.LogisticsOrderProxy
  console.log(`📋 Proxy address: ${proxyAddress}`)

  // Setup account (must be the proxy owner)
  const account = privateKeyToAccount(
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Account #0
  )

  const client = createWalletClient({
    account,
    chain: hardhat,
    transport: http('http://127.0.0.1:8545'),
  }).extend(publicActions)

  console.log(`👤 Upgrading from account: ${account.address}\n`)

  // Get the V2 artifact
  const LogisticsOrderV2Artifact = await hre.artifacts.readArtifact('LogisticsOrderV2')

  // Deploy V2 implementation
  console.log('📦 Deploying LogisticsOrderV2 implementation...')
  const v2Hash = await client.deployContract({
    abi: LogisticsOrderV2Artifact.abi,
    bytecode: LogisticsOrderV2Artifact.bytecode as `0x${string}`,
    args: [], // No constructor args
  })

  const v2Receipt = await client.waitForTransactionReceipt({ hash: v2Hash })
  const v2ImplAddress = v2Receipt.contractAddress!

  console.log(`✅ LogisticsOrderV2 implementation deployed to: ${v2ImplAddress}\n`)

  // Get the proxy contract instance (using V1 ABI for upgrade function)
  const LogisticsOrderArtifact = await hre.artifacts.readArtifact('LogisticsOrder')

  // Call upgradeToAndCall on the proxy
  console.log('🔄 Upgrading proxy to V2 implementation...')
  const upgradeHash = await client.writeContract({
    address: proxyAddress as `0x${string}`,
    abi: LogisticsOrderArtifact.abi,
    functionName: 'upgradeToAndCall',
    args: [v2ImplAddress, '0x'], // No initialization data needed
  })

  const upgradeReceipt = await client.waitForTransactionReceipt({ hash: upgradeHash })
  console.log(`✅ Upgrade transaction: ${upgradeHash}`)
  console.log(`   Gas used: ${upgradeReceipt.gasUsed.toString()}\n`)

  // Verify the upgrade by calling version()
  console.log('🔍 Verifying upgrade...')
  const version = await client.readContract({
    address: proxyAddress as `0x${string}`,
    abi: LogisticsOrderV2Artifact.abi,
    functionName: 'version',
    args: [], // No function args
  })

  console.log(`✅ Current version: ${version}`)

  // Update deployment info
  deploymentInfo.contracts.LogisticsOrderImplementationV2 = v2ImplAddress
  deploymentInfo.version = '2.0.0'
  deploymentInfo.timestamp = new Date().toISOString()

  fs.writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2))
  console.log('\n✅ deployment-info.json updated')

  console.log('\n🎉 Upgrade to V2 complete!')
  console.log('\n📝 Summary:')
  console.log(`   Proxy address (unchanged): ${proxyAddress}`)
  console.log(`   Old implementation: ${deploymentInfo.contracts.LogisticsOrderImplementationV1}`)
  console.log(`   New implementation: ${v2ImplAddress}`)
  console.log(`   Version: ${version}`)
  console.log('\n💡 All existing data is preserved!')
  console.log('💡 Sync artifacts to frontend: cd frontend && npm run sync')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
