const express = require("express");
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bodyParser = require('body-parser');
const stripe = require("stripe")(process.env.stripe_private)
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@clustersorav.tqapkj6.mongodb.net/?retryWrites=true&w=majority&appName=ClusterSorav`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// user verification 
const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;


  if (!authorization) {
    return res.status(401).send({ error: true, message: "Unauthorized access" })
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.secret, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: "Unauthorized access" })
    }
    req.decoded = decoded;
    next();
  })
}

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();

    const showCollection = client.db('Events').collection("Shows");
    const userCollection = client.db('Events').collection("user");
    const bookingCollection = client.db('Events').collection("booking");

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = await jwt.sign(user, process.env.secret, { expiresIn: "7d" });
      res.send({ token })
    })

    // get all show data 
    app.get("/allShow", async (req, res) => {
      const result = await showCollection.find().toArray();
      res.send(result);
    })

    // get specific show 
    app.get("/event/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await showCollection.findOne(filter);
      res.send(result);
    })

    // update user data 
    app.post("/user", async (req, res) => {
      const user = req.body;

      const filter = { email: user.email }

      const getUser = await userCollection.findOne(filter);

      if (getUser) {
        return res.send("User existed");
      }
      const result = await userCollection.insertOne(user);
      res.send(result);

    })

    // get user data 
    app.get("/user/:email", async (req, res) => {
      const user = req.params.email;

      const filter = { email: user }
      const result = await userCollection.findOne(filter);

      res.send(result);
    })

    app.get("/bookings/:eventName", async (req, res) => {
      const eventName  = req.params.eventName;

      const result = await bookingCollection.findOne({ eventName });
      res.send(result);
    })



    // need authorization
    // set booking data 
    app.post("/book", verifyJwt, async (req, res) => {
      const bookingData = req.body;
      console.log(bookingData);
      const event = bookingData.eventName
      const user = {
        user: bookingData.user,
        tickets: bookingData.tickets,
        price: bookingData.price
      }

      const booking = await bookingCollection.findOne({ event });

      if (!booking) {
        const newBook = {
          eventName: event,
          bookedUsers: [user]
        }
        const setBook = await bookingCollection.insertOne(newBook);
        res.send(setBook);
      } else {
        const addBook = await bookingCollection.updateOne({ eventName }, { $push: { bookedUsers: user } })
        res.send(addBook);
      }

    })

    // stripe payment method 
    app.post("/create-checkout-session", verifyJwt, async (req, res) => {
      const bookData = req.body;
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: bookData.eventName
                },
                unit_amount: parseInt(bookData.price * 100)
              },
              quantity: 1
            }
          ],
          mode: "payment",
          success_url: "https://subtle-cupcake-3a9d1b.netlify.app/success",
          cancel_url: "https://subtle-cupcake-3a9d1b.netlify.app/error",
        });

        // Wait for the payment to be processed
        const status = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["payment_intent"]
        });



          // Add the booking data to MongoDB
          addBookingToMongoDB(bookData);


        res.status(200).json({ id: session.id });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
      }
    });



    // set booking data 
    const addBookingToMongoDB = async (bookData) => {
      const eventName = bookData.eventName
      const user = {
        user: bookData.user,
        tickets: bookData.tickets,
        price: bookData.price
      }

      const booking = await bookingCollection.findOne({ eventName });

      if (!booking) {
        const newBook = {
          eventName,
          bookedUsers: [user]
        }
        const setBook = await bookingCollection.insertOne(newBook);

      } else {
        const addBook = await bookingCollection.updateOne({ eventName }, { $push: { bookedUsers: user } })

      }
    }


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

  } catch (err) {
    console.error(err);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server online");
})

// Listen to the port
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
