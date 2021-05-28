const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model')
const {getProfile} = require('./middleware/getProfile');
const { Op, fn, col } = require('sequelize');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) =>{
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const userId = req.profile.id;
    const contract = await Contract.findOne({
        where: {
            id,
            [Op.or]: [
                { ClientId: userId },
                { ContractorId: userId }
            ]
        }
    })
    if(!contract) return res.status(404).end()
    res.json(contract)
})

/**
 * @returns contract
 */
app.get('/contracts', getProfile, async (req, res) => {
    const {Contract} = req.app.get('models')
    const userId = req.profile.id;
    const contracts = await Contract.findAll({
        where: {
            [Op.or]: [
                { ClientId: userId },
                { ContractorId: userId }
            ],
            [Op.not]: {status: 'terminated'}
        }
    })
    if(!contracts) return res.status(404).end()
    res.json(contracts)
})

/**
 * @returns job
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const {Job, Contract} = req.app.get('models')
    const userId = req.profile.id;
    const unpaidJobs = await Job.findAll({
        include: {
            model: Contract,
            where: {
                [Op.or]: [
                    { ClientId: userId },
                    { ContractorId: userId }
                ]
            }
        },
        where: {
            paid: {
                [Op.not]: true
            }
        }
    });
    if(!unpaidJobs) return res.status(404).end()
    res.json(unpaidJobs)
})

app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
    const {Job, Contract, Profile} = req.app.get('models')
    const id = req.params.job_id
    const clientId = req.profile.id;

    const job = await Job.findOne({
        include: {
            model: Contract,
            include: [
                { model: Profile, as: 'Contractor'},
                { model: Profile, as: 'Client' }
            ],
            where: { ClientId: clientId }
        },
        where: {
            id,
            paid: { [Op.not]: true }
        }
    })

    if(!job) return res.status(404).end()

    const contract = job.Contract
    const contractor = contract.Contractor
    const client = contract.Client

    if (client.balance >= job.price) {
        const transaction = await sequelize.transaction()

        try {
            await Profile.update({ balance: client.balance - job.price}, { where: { id: client.id }})
            await Profile.update({ balance: contractor.balance + job.price}, { where: { id: contractor.id }})
            await Contract.update({ status: 'terminated'}, {where: {id: contract.id}})
            await Job.update({ paid: true, paymentDate: Date.now() }, {where: { id }})

            await transaction.commit()

            res.json({ message: 'Job paid'})
        } catch (error) {
            await transaction.rollback()

            res.status(500).end()
        }
    } else {
        res.status(500).send({ error: 'Client has not enough balance to pay for the job'}).end()
    }
})

app.post('/balances/deposit/:userId', getProfile, async (req, res) => {
    // TO DO later.... not sure if I understood the requeriment
    res.status(500).send({ error: 'not sure if I understood the requeriment'}).end()
})

app.get('/admin/best-profession', async (req, res) => {
    const { Job, Contract, Profile } = req.app.get('models')
    const { start, end } = req.query

    if (!start || !end) {
        res.status(400).send({ error: 'start and end dates are required'}).end()
    }

    const terminatedJobs = await Job.findAll({
        attributes: [[fn('SUM', col('price')), 'total']],
        include: {
            model: Contract,
            include: {
                model: Profile,
                as: 'Contractor'
            }
        },
        where: {
            paid: true,
            paymentDate: {
                [Op.between]: [start, end]
            }
        },
        group: ['Contract.Contractor.profession'],
        order: [[col('total'), 'DESC']],
        limit: 1
    })

    if(!terminatedJobs) return res.status(404).end()

    res.json({
        mostPaidProfession: terminatedJobs[0].Contract.Contractor.profession,
        amount: terminatedJobs[0].dataValues.total,
    })

})

app.get('/admin/best-clients', async (req, res) => {
    const { Job, Contract, Profile } = req.app.get('models')
    const { start, end, limit = 2 } = req.query;

    const clientsWhoPaidTheMost = 1

    if(!clientsWhoPaidTheMost) return res.status(404).end()

    res.json({ clientsWhoPaidTheMost: []})
})

module.exports = app;
