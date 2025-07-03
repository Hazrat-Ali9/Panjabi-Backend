const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const port = 3000

app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lzni2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    
    console.log("MongoDB Connected Successfully!");

    
    const productCollection = client.db("panjabi-server").collection("products");
    const cartsCollection = client.db("panjabi-server").collection("carts");
    const usersCollection = client.db("panjabi-server").collection("users");
    const reviewCollection = client.db("panjabi-server").collection("review");
    const paymentCollection = client.db("panjabi-server").collection("payment");


    // jwt function
    app.post('/jwt', async (req, res) => {
      console.log(req.headers)
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: '2h',
      })
      res.send({ token })
    })


    
    const verifyToken = (req, res, next) => {
      console.log('inside verifyToken', req.headers);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden hidden' });
      }

      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'forbidden access' });
        }
        req.decoded = decoded;
        next(); 
      });
    };


    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next(); 
    }



    // admin
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.send(403).send({ message: 'unauthorized access' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin })
    })


    
    app.get('/products', async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });

    app.post('/products', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await productCollection.insertOne(item);
      res.send(result)
    })

    app.patch('/products/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          price: item.price,
          category: item.category,
          categoryImage: item.categoryImage,
          color: item.color,
          section: item.section,
          details: item.details
        }
      }
      const result = await productCollection.updateOne(filter, updatedDoc);
      res.send(result)
    })

    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result)
    });
    app.delete('/products/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result)
    })

    app.post('/carts', async (req, res) => {
      const cartsItem = req.body;
      const result = await cartsCollection.insertOne(cartsItem);
      res.send(result)
    })

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const carts = await cartsCollection.find(query).toArray();
      res.send(carts)
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result)
    });

    app.post('/users', async (req, res) => {
      const cartItem = req.body;
      const query = { email: cartItem.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', inSertId: null })
      }
      const result = await usersCollection.insertOne(cartItem);
      res.send(result)
    });

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result)
    });

    app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      
      const user = await usersCollection.findOne(query);

      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      
      const newRole = user.role === 'admin' ? 'user' : 'admin';

      const updatedDoc = {
        $set: { role: newRole }
      };

      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // Review
    app.post('/review', async (req, res) => {
      const cartItem = req.body;
      const result = await reviewCollection.insertOne(cartItem);
      res.send(result)
    });

    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result)
    });

    app.get('/review/:id', async (req, res) => {
      const id = req.params.id;
      const query = { productId: id };
      const result = await reviewCollection.find(query).toArray();
      res.send(result)
    });

    // payment releted code
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // converting to paisa/cent

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // *************

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);
      const query = {
        _id: {
          $in: payment.cardIds.map(id => new ObjectId(id))
        }
      };
      const deleteResult = await cartsCollection.deleteMany(query);
      res.send({ paymentResult, deleteResult })
    })
    // ***************--------

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.decoded.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result)
    })
    // ***********

    app.get('/admin/payments', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await paymentCollection.find().sort({ date: -1 }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch all payments', error });
      }
    });


   
    app.get('/user-stats', verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const orders = await paymentCollection.find({ email }).toArray();

      const totalOrders = orders.length;

      const totalSpending = orders.reduce((acc, order) => acc + (order.price || 0), 0);


      const totalItemsOrdered = orders.reduce((acc, order) => acc + (order.quantity || 1), 0);

      res.send({
        totalOrders,
        totalSpending,
        totalItemsOrdered,
        recentOrders: orders.slice(-5).reverse() // recent 5 ta order
      });
    });



    // admin dashbord
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await productCollection.estimatedDocumentCount();
      const reviews = await reviewCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray()

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({ users, products, reviews, orders, revenue })
    })


    // /////////***----- */

    app.patch('/payments/status/:id', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const result = await paymentCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );
      res.send(result);
    });



    app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await paymentCollection.aggregate([
          // Step 1: unwind the array of productIds
          { $unwind: '$productIds' },

          // Step 2: Make sure each productId is an ObjectId
          {
            $addFields: {
              productId: {
                $cond: {
                  if: { $eq: [{ $type: '$productIds' }, 'objectId'] },
                  then: '$productIds',
                  else: { $toObjectId: '$productIds' }
                }
              }
            }
          },

          // Step 3: Lookup from products collection
          {
            $lookup: {
              from: 'products',
              localField: 'productId',
              foreignField: '_id',
              as: 'productInfo'
            }
          },

          // Step 4: unwind again
          { $unwind: '$productInfo' },

          // Step 5: group by product title
          {
            $group: {
              _id: '$productInfo.category',
              quantity: { $sum: 1 },
              revenue: { $sum: '$productInfo.price' }
            }
          },
          {
            $project: {
              _id: 0,
              category: '$_id',
              quantity: '$quantity',
              revenue: '$revenue'
            }
          }
        ]).toArray();

        res.send(result);
      } catch (error) {
        console.error('Error in /order-stats:', error);
        res.status(500).send({ message: 'Internal Server Error', error: error.message });
      }
    });



   

  } catch (error) {
    console.error("Database Connection Error:", error);
  }
}

run();

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
