const { expect } = require('chai')
const { ethers } = require('hardhat');
const { BigNumber } = require("ethers");


let DEFAULT_TIMEOUT = 1000000
let SIGNERS

let STOXContract
let NVDAContract
let ORDERBOOKContract
let STOXContractAddress
let NVDAContractAddress
let ORDERBOOKContractAddress
let distributedAmount = ethers.parseUnits('100', 18) // 100 tokens with 18 decimals
let buyAmount = 2
let sellAmount = 2
let usedWalletNbForCancel = 2
let usedWalletNbForExecuteBestSell = 5
let usedWalletNbForCancelWhilePaused = 3
let bestSellPrice = 10

describe('Retrieve Connected Signers', function () {
    it('retrieve the connected  signers', async function () {
        SIGNERS = await ethers.getSigners()
        //console.log('Signers:', SIGNERS)
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Deploy contracts', function () {
    it('should deploy the STOX token contract', async function () {
        this.STOXContractFactory = await ethers.getContractFactory('Stox')
        STOXContract = await this.STOXContractFactory.deploy()
        await STOXContract.waitForDeployment()
        STOXContractAddress = await STOXContract.getAddress()
        console.log('STOX token deployed to:', STOXContractAddress)
    }).timeout(DEFAULT_TIMEOUT)

    it('should deploy the NVDA security token contract', async function () {
        const amount = ethers.parseUnits('100000', 18)
        this.NVDAContractFactory = await ethers.getContractFactory(
            'NvidiaSecurity'
        )
        NVDAContract = await this.NVDAContractFactory.deploy(amount)
        await NVDAContract.waitForDeployment()
        NVDAContractAddress = await NVDAContract.getAddress()
        console.log('NVDA token deployed to:',NVDAContractAddress)
    }).timeout(DEFAULT_TIMEOUT)

    it('should deploy the Order Book contract', async function () {
        this.ORDERBOOKContractFactory = await ethers.getContractFactory(
            'Orderbook'
        )
        ORDERBOOKContract = await this.ORDERBOOKContractFactory.deploy(
            STOXContractAddress,
            NVDAContractAddress
        )
        await ORDERBOOKContract.waitForDeployment()
        ORDERBOOKContractAddress = await ORDERBOOKContract.getAddress()
        console.log('Order Book deployed to:', ORDERBOOKContractAddress)
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Distribute tokens', function () {
    it('should send 100 NVDA and 100 STOX tokens to 5 test wallets', async function () {
        for (let x = 1; x < 6; x++) {
            await NVDAContract.transfer(
                await SIGNERS[x].address,
                distributedAmount
            )
            await STOXContract.transfer(
                await SIGNERS[x].address,
                distributedAmount
            )
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should confirm the wallets received the STOX tokens', async function () {
        for (let x = 1; x < 6; x++) {
            const balance = await STOXContract.balanceOf(
                SIGNERS[x].address
            )
            console.log(
                `Wallet ${SIGNERS[x].address} STOX balance:`,
                ethers.formatUnits(balance, 18)
            )
            expect(balance.toString()).to.equal(distributedAmount.toString())
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should confirm the wallets received the NVDA tokens', async function () {
        for (let x = 1; x < 6; x++) {
            const balance = await NVDAContract.balanceOf(
                SIGNERS[x].address
            )
            console.log(
                `Wallet ${SIGNERS[x].address} NVDA balance:`,
                ethers.formatUnits(balance, 18)
            )
            expect(balance.toString()).to.equal(distributedAmount.toString())
        }
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Fill order book with 4 BUY orders', function () {

    it('should approve the spending for 4 buy orders', async function () {
        for (let x = 1; x < 5; x++) {
            const buyCashAmount = buyAmount * x

            const buyCashAmountEth = ethers.parseUnits(
                buyCashAmount.toString(),
                18
            )

            const stoxContractForWallet = STOXContract.connect(SIGNERS[x])

            // Approve the ORDERBOOKContract to spend tokens on behalf of this wallet
            await stoxContractForWallet.approve(
                ORDERBOOKContract.getAddress(),
                buyCashAmountEth
            )

            // Verify approval (optional)
            const allowance = await STOXContract.allowance(
                SIGNERS[x].address,
                ORDERBOOKContract.getAddress()
            )
            console.log(
                `Wallet ${SIGNERS[x].address
                } approved to spend ${ethers.formatUnits(
                    allowance,
                    18
                )} STOX tokens for ORDERBOOKContract`
            )

            // Add assertions if needed
            expect(allowance.toString()).to.equal(buyCashAmountEth.toString())
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should submit 4 buy orders to fill the order book with incremental prices', async function () {
        for (let x = 1; x < 5; x++) {
            const buyAmountEth = ethers.parseUnits(
                buyAmount.toString(),
                18
            )
            const buyPriceEth = ethers.parseUnits(x.toString(), 18)

            const orderBookContractForWallet = ORDERBOOKContract.connect(
                SIGNERS[x]
            )

            // Send the buy order on behalf of this wallet
            await orderBookContractForWallet.placeBuy(buyPriceEth, buyAmountEth)
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getBuySide', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getBuySide()
        console.log(result)

        // Expected values
        const expectedAddresses = [
            SIGNERS[4].address,
            SIGNERS[3].address,
            SIGNERS[2].address,
            SIGNERS[1].address,
        ]

        const expectedAmounts = [
            ethers.getBigInt('4000000000000000000'),
            ethers.getBigInt('3000000000000000000'),
            ethers.getBigInt('2000000000000000000'),
            ethers.getBigInt('1000000000000000000'),
        ]

        const expectedPrices = [
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedAmounts.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedPrices.map(String))
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Fill order book with 4 SELL orders', function () {

    it('should approve the spending for 4 SELL orders', async function () {
        for (let x = 1; x < 5; x++) {
            const sellAmountEth = ethers.parseUnits(
                sellAmount.toString(),
                18
            )
            console.log('sellAmountEth', sellAmountEth)
            const nvdaContractForWallet = NVDAContract.connect(SIGNERS[x])

            // Approve the ORDERBOOKContract to spend tokens on behalf of this wallet
            await nvdaContractForWallet.approve(
                ORDERBOOKContract.getAddress(),
                sellAmountEth
            )

            // Verify approval (optional)
            const allowance = await NVDAContract.allowance(
                SIGNERS[x].address,
                ORDERBOOKContract.getAddress()
            )
            console.log(
                `Wallet ${SIGNERS[x].address
                } approved to spend ${ethers.formatUnits(
                    allowance,
                    18
                )} NVDA tokens for ORDERBOOKContract`
            )

            // Add assertions if needed
            expect(allowance.toString()).to.equal(sellAmountEth.toString())
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should submit 4 sell orders (equal respectively to the double of the buy orders) to fill the order book with incremental prices', async function () {

        for (let x = 1; x < 5; x++) {
            // Define the sell price and amount
            const sellPriceEth = ethers.parseUnits(
                (x * 10).toString(),
                18
            ) // Incremental prices

            const sellAmountEth = ethers.parseUnits(
                sellAmount.toString(),
                18
            ) // Convert to 18 decimals

            // Connect the order book contract to the seller's account
            const orderBookContractForWallet = ORDERBOOKContract.connect(
                SIGNERS[x]
            )

            // Place the sell order (price first, then amount)
            const tx = await orderBookContractForWallet.placeSell(
                sellPriceEth,
                sellAmountEth
            )

            // Wait for the transaction to be mined
            // const receipt = await tx.wait()

            // Log the transaction result
            //console.log(`Sell order placed by ${SIGNERS[x].address}`)
            //console.log('Transaction receipt:', receipt)
        }
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getSellSide', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getSellSide()
        console.log(result)

        // Expected values
        const expectedAddresses = [
            SIGNERS[1].address,
            SIGNERS[2].address,
            SIGNERS[3].address,
            SIGNERS[4].address,
        ]

        const expectedPrices = [
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('20000000000000000000'),
            ethers.getBigInt('30000000000000000000'),
            ethers.getBigInt('40000000000000000000'),
        ]

        const expectedAmounts = [
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedPrices.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedAmounts.map(String))
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Cancel orders', function () {
    it('should cancel one BUY order', async function () {

        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForCancel]
        )

        // Send the buy order on behalf of this wallet
        await orderBookContractForWallet.cancelBuy()
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getBuySide after one BUY order has been cancelled', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getBuySide()
        console.log(result)

        // Expected values
        const expectedAddresses = [
            SIGNERS[4].address,
            SIGNERS[3].address,
            //SIGNERS[2].address,
            SIGNERS[1].address,
        ]

        const expectedAmounts = [
            ethers.getBigInt('4000000000000000000'),
            ethers.getBigInt('3000000000000000000'),
            //  ethers.getBigInt('2000000000000000000'),
            ethers.getBigInt('1000000000000000000'),
        ]

        const expectedPrices = [
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            // ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedAmounts.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedPrices.map(String))
    }).timeout(DEFAULT_TIMEOUT)

    it('should cancel one SELL order', async function () {


        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForCancel]
        )

        // Send the buy order on behalf of this wallet
        await orderBookContractForWallet.cancelSell()
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getSellSide after one SELL order has been cancelled', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getSellSide()
        console.log(result)


        // Expected values
        const expectedAddresses = [
            SIGNERS[1].address,
            //SIGNERS[2].address,
            SIGNERS[3].address,
            SIGNERS[4].address,
        ]

        const expectedPrices = [
            ethers.getBigInt('10000000000000000000'),
            //ethers.getBigInt('20000000000000000000'),
            ethers.getBigInt('30000000000000000000'),
            ethers.getBigInt('40000000000000000000'),
        ]

        const expectedAmounts = [
            ethers.getBigInt('10000000000000000000'),
            //ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedPrices.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedAmounts.map(String))
    }).timeout(DEFAULT_TIMEOUT)

})

describe('Fully execute the best sell side order', function () {

    it('should approve the spending for one  buy orders that will fully execute the  best sell price', async function () {


        const buyCashAmount = buyAmount * bestSellPrice

        const buyCashAmountEth = ethers.parseUnits(
            buyCashAmount.toString(),
            18
        )

        const stoxContractForWallet = STOXContract.connect(
            SIGNERS[usedWalletNbForExecuteBestSell]
        )

        // Approve the ORDERBOOKContract to spend tokens on behalf of this wallet
        await stoxContractForWallet.approve(
            ORDERBOOKContract.getAddress(),
            buyCashAmountEth
        )

        // Verify approval (optional)
        const allowance = await STOXContract.allowance(
            SIGNERS[usedWalletNbForExecuteBestSell].address,
            ORDERBOOKContract.getAddress()
        )
        console.log(
            `Wallet ${SIGNERS[usedWalletNbForExecuteBestSell].address
            } approved to spend ${ethers.formatUnits(
                allowance,
                18
            )} STOX tokens for ORDERBOOKContract`
        )

        // Add assertions if needed
        expect(allowance.toString()).to.equal(buyCashAmountEth.toString())
    }).timeout(DEFAULT_TIMEOUT)

    it('should submit 1 buy orders to execute the best sell order', async function () {


        const buyAmountEth = ethers.parseUnits(buyAmount.toString(), 18)
        const buyPriceEth = ethers.parseUnits(
            bestSellPrice.toString(),
            18
        )

        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForExecuteBestSell]
        )

        // Send the buy order on behalf of this wallet
        await orderBookContractForWallet.placeBuy(buyPriceEth, buyAmountEth)
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getBuySide', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getBuySide()
        console.log(result)


        // Expected values
        const expectedAddresses = [
            SIGNERS[4].address,
            SIGNERS[3].address,
            //SIGNERS[2].address,
            SIGNERS[1].address,
        ]

        const expectedAmounts = [
            ethers.getBigInt('4000000000000000000'),
            ethers.getBigInt('3000000000000000000'),
            // ethers.getBigInt('2000000000000000000'),
            ethers.getBigInt('1000000000000000000'),
        ]

        const expectedPrices = [
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            // ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedAmounts.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedPrices.map(String))
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the output of getSellSide', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getSellSide()
        console.log(result)


        // Expected values
        const expectedAddresses = [
            //SIGNERS[2].address,
            SIGNERS[3].address,
            SIGNERS[4].address,
        ]

        const expectedPrices = [
            // ethers.getBigInt('20000000000000000000'),
            ethers.getBigInt('30000000000000000000'),
            ethers.getBigInt('40000000000000000000'),
        ]

        const expectedAmounts = [
            // ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedPrices.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedAmounts.map(String))
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the buyer can withdraw its securities', async function () {
        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForExecuteBestSell])
        const withdrawableSecurities =
            await orderBookContractForWallet.getWithdrawableSecurities({
                gasLimit: 500000,
            })
        console.log(withdrawableSecurities)
        expect(withdrawableSecurities.toString()).to.equal(
            ethers.parseUnits(buyAmount.toString(), 18)
        )
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify the seller can withdraw its currencies', async function () {
        // The seller whose order has been executed is SIGNERS[1]


        const orderBookContractForWallet = ORDERBOOKContract.connect(SIGNERS[1])
        // Send the buy order on behalf of this wallet
        const withdrawableCurrencies =
            await orderBookContractForWallet.getWithdrawableCurrencies({
                gasLimit: 500000,
            })
        console.log(withdrawableCurrencies)
        expect(
            ethers.parseUnits((buyAmount * bestSellPrice).toString(), 18)
        ).to.equal(withdrawableCurrencies.toString())
    }).timeout(DEFAULT_TIMEOUT)
})

describe('Emergency Features Test', function () {
    it('should Pause the OrderBook', async function () {
        await ORDERBOOKContract.pauseOrderBook()
    }).timeout(DEFAULT_TIMEOUT)

    it('should try to cancel one SELL order', async function () {


        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForCancelWhilePaused]
        )

        // Send the buy order on behalf of this wallet

        await expect(
            orderBookContractForWallet.cancelSell({ gasLimit: 500000 })
        ).to.be.reverted;


    }).timeout(DEFAULT_TIMEOUT)

    it('should verify that the output of getSellSide has NOT changed', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getSellSide()
        console.log(result)


        // Expected values
        const expectedAddresses = [
            //SIGNERS[2].address,
            SIGNERS[3].address,
            SIGNERS[4].address,
        ]

        const expectedPrices = [
            // ethers.getBigInt('20000000000000000000'),
            ethers.getBigInt('30000000000000000000'),
            ethers.getBigInt('40000000000000000000'),
        ]

        const expectedAmounts = [
            // ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedPrices.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedAmounts.map(String))
    }).timeout(DEFAULT_TIMEOUT)

    it('should Unpause the OrderBook', async function () {
        await ORDERBOOKContract.unpauseOrderBook()
    }).timeout(DEFAULT_TIMEOUT)

    it('should try to cancel one SELL order', async function () {


        const orderBookContractForWallet = ORDERBOOKContract.connect(
            SIGNERS[usedWalletNbForCancelWhilePaused]
        )

        // Send the buy order on behalf of this wallet
        await orderBookContractForWallet.cancelSell({ gasLimit: 500000 })
    }).timeout(DEFAULT_TIMEOUT)

    it('should verify that the output of getSellSide has  changed', async function () {
        // Call the getBuySide function
        const result = await ORDERBOOKContract.getSellSide()
        console.log(result)


        // Expected values
        const expectedAddresses = [
            //SIGNERS[2].address,
            //SIGNERS[3].address,
            SIGNERS[4].address,
        ]

        const expectedPrices = [
            // ethers.getBigInt('20000000000000000000'),
            //ethers.getBigInt('30000000000000000000'),
            ethers.getBigInt('40000000000000000000'),
        ]

        const expectedAmounts = [
            // ethers.getBigInt('10000000000000000000'),
            // ethers.getBigInt('10000000000000000000'),
            ethers.getBigInt('10000000000000000000'),
        ]

        // Verify addresses
        expect(result[0]).to.deep.equal(expectedAddresses)

        // Verify amounts
        expect(result[1].map(String)).to.deep.equal(expectedPrices.map(String))

        // Verify prices
        expect(result[2].map(String)).to.deep.equal(expectedAmounts.map(String))
    }).timeout(DEFAULT_TIMEOUT)
})
