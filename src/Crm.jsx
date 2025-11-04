import { useState, useEffect, useRef } from "react";
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

/* ---- Small UI helpers ---- */
function SidebarButton({ active, onClick, children, darkMode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md text-sm
        ${active
          ? darkMode
            ? "bg-gray-900 text-white"
            : "bg-gray-200 text-black"
          : darkMode
            ? "bg-black text-white"
            : "bg-white text-black"}
        border-2 border-sky-400
        cursor-pointer
      `}
      style={{ boxShadow: "none" }}
    >
      {children}
    </button>
  );
}

function Card({ title, right, children, darkMode }) {
  return (
    <section
      className={`border-2 border-sky-400 rounded-xl p-4 shadow-sm mb-4
        ${darkMode ? "bg-black text-white" : "bg-white text-black"}
      `}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-black"}`}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ---- Sample Data ---- */
const initialCustomers = [
  { id: 1, first: "Ray", last: "Brown", address: "3 Curtis Ln", town: "Dennis", zip: "02638", roofColor: "Charcoal", status: "Lead", jobType: "Roofing", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
  { id: 2, first: "Russ", last: "Couturier", address: "12 Main St", town: "Barnstable", zip: "02630", roofColor: "Oyster Gray", status: "Prospect", jobType: "Roofing & Siding", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
  { id: 3, first: "Brian", last: "Mucciarone", address: "8 Pine Ave", town: "Dennis", zip: "02638", roofColor: "Weathered Wood", status: "Approved", jobType: "Siding", soldDate: "2025-08-10", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
  { id: 4, first: "Marybeth", last: "Magnuson", address: "45 Oak Rd", town: "Yarmouth", zip: "02664", roofColor: "—", status: "Prospect", jobType: "Roofing", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
  { id: 5, first: "Patrick", last: "Gillis", address: "77 Elm St", town: "Harwich", zip: "02645", roofColor: "—", status: "Lead", jobType: "Roofing", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
  { id: 6, first: "Eileen", last: "Carlton", address: "9 Willow Ln", town: "Dennis", zip: "02638", roofColor: "—", status: "Complete", jobType: "Siding", soldDate: "2025-08-12", documents: [], photos: [], notes: [], tasks: [], communication: [], phone: "" },
];

/* ---- Lead Form ---- */
function LeadForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    first: "",
    last: "",
    address: "",
    town: "",
    zip: "",
    email: "",
    phone: "",
    jobType: "",
  });

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // FIX: Make input text always readable (black text on white background)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
      <form
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4 relative"
        onSubmit={e => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <h2 className="text-xl font-bold mb-2">Create New Lead</h2>
        <div className="grid grid-cols-2 gap-3">
          <input name="first" value={form.first} onChange={handleChange} placeholder="First Name" required className="border rounded px-3 py-2 text-black bg-white" />
          <input name="last" value={form.last} onChange={handleChange} placeholder="Last Name" required className="border rounded px-3 py-2 text-black bg-white" />
          <input name="address" value={form.address} onChange={handleChange} placeholder="Street Address" required className="border rounded px-3 py-2 col-span-2 text-black bg-white" />
          <input name="town" value={form.town} onChange={handleChange} placeholder="Town" required className="border rounded px-3 py-2 text-black bg-white" />
          <input name="zip" value={form.zip} onChange={handleChange} placeholder="Zip" required className="border rounded px-3 py-2 text-black bg-white" />
          <input name="email" value={form.email} onChange={handleChange} placeholder="Email" required className="border rounded px-3 py-2 col-span-2 text-black bg-white" />
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="border rounded px-3 py-2 col-span-2 text-black bg-white" />
          <input name="jobType" value={form.jobType} onChange={handleChange} placeholder="Job Type" className="border rounded px-3 py-2 col-span-2 text-black bg-white" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className="border rounded px-4 py-2 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="submit" className="border rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">Save Lead</button>
        </div>
      </form>
    </div>
  );
}

/* ---- Edit Customer Modal ---- */
function EditCustomerModal({ customer, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({
    phoneNumbers: customer.phoneNumbers || [customer.phone || ""],
    emails: customer.emails || [customer.email || ""],
    contacts: customer.contacts || [],
  });

  const relationshipOptions = [
    "Husband", "Wife", "Brother", "Sister", "Neighbor", "Friend", "Family Member", "Other"
  ];

  const handleChange = (field, idx, value) => {
    setForm(f => ({
      ...f,
      [field]: f[field].map((item, i) => (i === idx ? value : item)),
    }));
  };

  const handleAddField = (field) => {
    setForm(f => ({
      ...f,
      [field]: [...f[field], ""],
    }));
  };

  const handleRemoveField = (field, idx) => {
    setForm(f => ({
      ...f,
      [field]: f[field].filter((_, i) => i !== idx),
    }));
  };

  const handleContactChange = (idx, key, value) => {
    setForm(f => ({
      ...f,
      contacts: f.contacts.map((c, i) =>
        i === idx ? { ...c, [key]: value } : c
      ),
    }));
  };

  const handleAddContact = () => {
    setForm(f => ({
      ...f,
      contacts: [...f.contacts, { name: "", phone: "", email: "", relationship: "" }],
    }));
  };

  const handleRemoveContact = (idx) => {
    setForm(f => ({
      ...f,
      contacts: f.contacts.filter((_, i) => i !== idx),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
      <form
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 relative"
        onSubmit={e => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <h2 className="text-xl font-bold mb-2">Edit Customer Contacts</h2>
        <div className="space-y-2">
          <div>
            <div className="font-semibold mb-1">Phone Numbers</div>
            {form.phoneNumbers.map((phone, idx) => (
              <div key={idx} className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={phone}
                  onChange={e => handleChange("phoneNumbers", idx, e.target.value)}
                  placeholder="Phone"
                  className="border rounded px-3 py-2 flex-1"
                />
                {form.phoneNumbers.length > 1 && (
                  <button type="button" onClick={() => handleRemoveField("phoneNumbers", idx)} className="text-red-600 px-2">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => handleAddField("phoneNumbers")} className="text-blue-600 text-xs mt-1">+ Add Phone</button>
          </div>
          <div>
            <div className="font-semibold mb-1">Emails</div>
            {form.emails.map((email, idx) => (
              <div key={idx} className="flex gap-2 mb-1">
                <input
                  type="email"
                  value={email}
                  onChange={e => handleChange("emails", idx, e.target.value)}
                  placeholder="Email"
                  className="border rounded px-3 py-2 flex-1"
                />
                {form.emails.length > 1 && (
                  <button type="button" onClick={() => handleRemoveField("emails", idx)} className="text-red-600 px-2">✕</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => handleAddField("emails")} className="text-blue-600 text-xs mt-1">+ Add Email</button>
          </div>
          <div>
            <div className="font-semibold mb-1">Additional Contacts</div>
            {form.contacts.map((contact, idx) => (
              <div key={idx} className="flex gap-2 mb-1 items-center">
                <input
                  type="text"
                  value={contact.name}
                  onChange={e => handleContactChange(idx, "name", e.target.value)}
                  placeholder="Name"
                  className="border rounded px-2 py-1 text-xs"
                />
                <input
                  type="text"
                  value={contact.phone}
                  onChange={e => handleContactChange(idx, "phone", e.target.value)}
                  placeholder="Phone"
                  className="border rounded px-2 py-1 text-xs"
                />
                <input
                  type="email"
                  value={contact.email}
                  onChange={e => handleContactChange(idx, "email", e.target.value)}
                  placeholder="Email"
                  className="border rounded px-2 py-1 text-xs"
                />
                <select
                  value={contact.relationship}
                  onChange={e => handleContactChange(idx, "relationship", e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">Relationship</option>
                  {relationshipOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <button type="button" onClick={() => handleRemoveContact(idx)} className="text-red-600 px-2">✕</button>
              </div>
            ))}
            <button type="button" onClick={handleAddContact} className="text-blue-600 text-xs mt-1">+ Add Contact</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className="border rounded px-4 py-2 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="submit" className="border rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">Save</button>
        </div>
        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={() => onDelete(customer.id)}
            className="flex items-center gap-2 text-xs text-red-600 hover:text-red-800"
            style={{ border: "none", background: "none", cursor: "pointer" }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <rect x="6" y="9" width="12" height="9" rx="2" fill="#fff"/>
              <path d="M9 9v6M12 9v6M15 9v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
              <rect x="4" y="6" width="16" height="2" rx="1" fill="#dc2626"/>
              <rect x="9" y="3" width="6" height="3" rx="1.5" fill="#dc2626"/>
            </svg>
            Delete Customer
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---- Email Compose Modal ---- */
const emailTemplates = [
  { name: "Welcome", body: "Hi {name},\n\nWelcome to HyTech! We're excited to work with you." },
  { name: "Job Scheduled", body: "Hi {name},\n\nYour job is scheduled for {date}. Please let us know if you have any questions." },
  { name: "Follow Up", body: "Hi {name},\n\nJust following up regarding your recent inquiry. Let us know how we can help!" },
];

function ComposeEmailModal({ customer, onSend, onCancel }) {
  const [to, setTo] = useState(customer.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    if (selectedTemplate) {
      const template = emailTemplates.find(t => t.name === selectedTemplate);
      if (template) {
        setBody(template.body.replace("{name}", customer.first));
      }
    }
  }, [selectedTemplate, customer]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
      <form
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4 relative"
        onSubmit={e => {
          e.preventDefault();
          onSend({ to, subject, body });
        }}
      >
        <h2 className="text-xl font-bold mb-2">Compose Email</h2>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold mb-1">To</label>
            <input type="email" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Subject</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Template</label>
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="border rounded px-3 py-2 w-full">
              <option value="">Choose a template…</option>
              {emailTemplates.map(t => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} className="border rounded px-3 py-2 w-full" required />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className="border rounded px-4 py-2 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="submit" className="border rounded px-4 py-2 bg-blue-600 text-white hover:bg-blue-700">Send</button>
        </div>
      </form>
    </div>
  );
}

function CommunicationPanel({ customer, onAddCommunication, onSendEmail }) {
  const [showCompose, setShowCompose] = useState(false);

  return (
    <Card
      title="Communication"
      right={
        <button
          className="border rounded px-2 py-1 text-xs bg-blue-600 text-white flex items-center gap-1"
          onClick={() => setShowCompose(true)}
          title="Compose Email"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v12h12V6H6zm2 2h8v2H8V8zm0 4h8v2H8v-2z" fill="#fff"/></svg>
          Compose
        </button>
      }
    >
      {showCompose && (
        <ComposeEmailModal
          customer={customer}
          onSend={email => {
            // Add to communication log
            onSendEmail(customer.id, email);
            setShowCompose(false);
          }}
          onCancel={() => setShowCompose(false)}
        />
      )}
      <div className="border rounded bg-gray-50 p-2 mb-2">
        <div className="font-semibold text-xs mb-1">Inbox</div>
        {customer.communication?.length === 0 ? (
          <div className="text-xs text-gray-400">No communication yet.</div>
        ) : (
          <ul className="space-y-1">
            {customer.communication.map((comm, idx) => (
              <li key={idx} className="text-xs bg-white rounded px-2 py-1 border mb-1">
                {comm}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---- Profile Drawer/Card ---- */
function CustomerProfile({
  customer,
  onClose,
  fullScreen,
  setFullScreen,
  onAddDocument,
  onAddPhoto,
  onDelete,
  onAddNote,
  onAddTask,
  onAddCommunication,
  onEdit,
  darkMode
}) {
  const [docName, setDocName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [noteText, setNoteText] = useState("");
  const [taskText, setTaskText] = useState("");
  const [commText, setCommText] = useState("");

  if (!customer) return null;
  return (
    <div
      className={`fixed top-0 right-0 h-full shadow-2xl border-l z-50 transition-all ${
        fullScreen ? "w-full" : "w-[420px]"
      } ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}
      style={{ maxWidth: "100vw" }}
    >
      <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}>
        <h2 className={`text-xl font-bold ${darkMode ? "text-white" : "text-black"}`}>
          {customer.first} {customer.last}
        </h2>
        <div className="flex gap-2">
          <button
            className={`border rounded px-2 py-1 text-xs ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}
            onClick={() => setFullScreen(!fullScreen)}
          >
            {fullScreen ? "Drawer" : "Full Screen"}
          </button>
          <button
            className={`border rounded px-2 py-1 text-xs ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className={`border rounded px-2 py-1 text-xs ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
      <div className="p-6 space-y-4 overflow-y-auto h-[calc(100vh-64px)] relative">
        <Card title="Profile" darkMode={darkMode}>
          <div className="space-y-1">
            <div><strong>Address:</strong> {customer.address}, {customer.town} {customer.zip}</div>
            <div><strong>Email:</strong> {customer.email}</div>
            <div><strong>Phone:</strong> {customer.phone}</div>
            <div><strong>Roof Color:</strong> {customer.roofColor}</div>
            <div><strong>Job Type:</strong> {customer.jobType}</div>
            <div><strong>Status:</strong> {customer.status}</div>
            <div><strong>Roof Squares:</strong> {customer.roofSquares ?? ""}</div>
            <div><strong>Siding Squares:</strong> {customer.sidingSquares ?? ""}</div>
          </div>
        </Card>
        <Card title="Documents" right={
          <form
            onSubmit={e => {
              e.preventDefault();
              if (docName) {
                onAddDocument(customer.id, docName);
                setDocName("");
              }
            }}
          >
            <input
              type="text"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              placeholder="Add document name"
              className="border rounded px-2 py-1 text-xs mr-2"
            />
            <button type="submit" className="border rounded px-2 py-1 text-xs bg-blue-600 text-white" title="Add Document">+</button>
          </form>
        } darkMode={darkMode}>
          {customer.documents?.length === 0 ? (
            <div className="text-xs text-gray-400">No documents uploaded.</div>
          ) : (
            <ul className="space-y-1">
              {customer.documents.map((doc, idx) => (
                <li key={idx} className="text-xs bg-gray-100 rounded px-2 py-1">{doc}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Photos" right={
          <form
            onSubmit={e => {
              e.preventDefault();
              if (photoUrl) {
                onAddPhoto(customer.id, photoUrl);
                setPhotoUrl("");
              }
            }}
          >
            <input
              type="text"
              value={photoUrl}
              onChange={e => setPhotoUrl(e.target.value)}
              placeholder="Paste photo URL"
              className="border rounded px-2 py-1 text-xs mr-2"
            />
            <button type="submit" className="border rounded px-2 py-1 text-xs bg-blue-600 text-white" title="Add Photo">+</button>
          </form>
        } darkMode={darkMode}>
          {customer.photos?.length === 0 ? (
            <div className="text-xs text-gray-400">No photos uploaded.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {customer.photos.map((url, idx) => (
                <img key={idx} src={url} alt={`Photo ${idx + 1}`} className="rounded border object-cover w-full h-24" />
              ))}
            </div>
          )}
        </Card>
        <Card title="Notes" right={
          <form
            onSubmit={e => {
              e.preventDefault();
              if (noteText) {
                onAddNote(customer.id, noteText);
                setNoteText("");
              }
            }}
          >
            <input
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add note"
              className="border rounded px-2 py-1 text-xs mr-2"
            />
            <button type="submit" className="border rounded px-2 py-1 text-xs bg-blue-600 text-white" title="Add Note">+</button>
          </form>
        } darkMode={darkMode}>
          {customer.notes?.length === 0 ? (
            <div className="text-xs text-gray-400">No notes yet.</div>
          ) : (
            <ul className="space-y-1">
              {customer.notes.map((note, idx) => (
                <li key={idx} className="text-xs bg-yellow-50 rounded px-2 py-1">{note}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Tasks" right={
          <form
            onSubmit={e => {
              e.preventDefault();
              if (taskText) {
                onAddTask(customer.id, taskText);
                setTaskText("");
              }
            }}
          >
            <input
              type="text"
              value={taskText}
              onChange={e => setTaskText(e.target.value)}
              placeholder="Add task"
              className="border rounded px-2 py-1 text-xs mr-2"
            />
            <button type="submit" className="border rounded px-2 py-1 text-xs bg-blue-600 text-white" title="Add Task">+</button>
          </form>
        } darkMode={darkMode}>
          {customer.tasks?.length === 0 ? (
            <div className="text-xs text-gray-400">No tasks yet.</div>
          ) : (
            <ul className="space-y-1">
              {customer.tasks.map((task, idx) => (
                <li key={idx} className="text-xs bg-blue-50 rounded px-2 py-1">{task}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Communication" right={
          <form
            onSubmit={e => {
              e.preventDefault();
              if (commText) {
                onAddCommunication(customer.id, commText);
                setCommText("");
              }
            }}
          >
            <input
              type="text"
              value={commText}
              onChange={e => setCommText(e.target.value)}
              placeholder="Add communication"
              className="border rounded px-2 py-1 text-xs mr-2"
            />
            <button type="submit" className="border rounded px-2 py-1 text-xs bg-blue-600 text-white" title="Add Communication">+</button>
          </form>
        } darkMode={darkMode}>
          {customer.communication?.length === 0 ? (
            <div className="text-xs text-gray-400">No communication yet.</div>
          ) : (
            <ul className="space-y-1">
              {customer.communication.map((comm, idx) => (
                <li key={idx} className="text-xs bg-green-50 rounded px-2 py-1">{comm}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ---- Table Component ---- */
function CustomerTable({ customers, onNameClick, onStatusChange, darkMode }) {
  const statusOptions = ["Lead", "Prospect", "Approved", "Complete", "Invoiced"];
  return (
    <table className="min-w-full text-sm">
      <thead>
        <tr className={darkMode ? "text-left text-gray-300" : "text-left text-gray-600"}>
          <th className="py-2 pr-4">Name</th>
          <th className="py-2 pr-4">Street Address</th>
          <th className="py-2 pr-4">Town</th>
          <th className="py-2 pr-4">Zip</th>
          <th className="py-2 pr-4">Roof Color</th>
          <th className="py-2 pr-4">Job Type</th>
          <th className="py-2 pr-4">Status</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((r) => (
          <tr
            key={r.id}
            className={
              darkMode
                ? "border-t bg-black text-white cursor-pointer"
                : "border-t bg-white text-black cursor-pointer"
            }
          >
            <td
              className={darkMode ? "py-2 pr-4 font-medium text-blue-300" : "py-2 pr-4 font-medium text-blue-700"}
              onClick={() => onNameClick(r)}
            >
              {r.first} {r.last}
            </td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>{r.address}</td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>{r.town}</td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>{r.zip}</td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>{r.roofColor}</td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>{r.jobType}</td>
            <td className={darkMode ? "py-2 pr-4" : "py-2 pr-4"}>
              <select
                value={r.status}
                onChange={e => onStatusChange(r.id, e.target.value)}
                className={
                  darkMode
                    ? "border rounded px-2 py-1 text-xs bg-black text-sky-400"
                    : "border rounded px-2 py-1 text-xs bg-white text-black"
                }
              >
                {statusOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---- Customers, Leads, Prospects ---- */
function Customers({ customers, onNameClick, onStatusChange, darkMode }) {
  const [q, setQ] = useState("");
  const filtered = customers.filter((r) => {
    const s = `${r.first} ${r.last} ${r.address} ${r.town} ${r.zip} ${r.roofColor} ${r.status} ${r.jobType}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="border rounded px-3 py-2 text-sm w-80"
        />
      </div>
      <Card title="All Customers" darkMode={darkMode}>
        <CustomerTable customers={filtered} onNameClick={onNameClick} onStatusChange={onStatusChange} darkMode={darkMode} />
      </Card>
    </div>
  );
}

function Leads({ customers, onNameClick, onAddLead, onStatusChange, darkMode }) {
  const leads = customers.filter((c) => c.status === "Lead");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
  <h1 className="text-2xl font-semibold">Pipeline</h1>
        <button
          className="border rounded px-3 py-2 text-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
          onClick={onAddLead}
          title="Add Lead"
        >
          <span className="text-xl font-bold">+</span>
          <span className="hidden sm:inline">Add Lead</span>
        </button>
      </div>
      <Card title="Lead Customers" darkMode={darkMode}>
        <CustomerTable customers={leads} onNameClick={onNameClick} onStatusChange={onStatusChange} darkMode={darkMode} />
      </Card>
    </div>
  );
}

/* ---- Archive (by Year) ---- */
function Archive({ customers, darkMode }) {
  // Group by year based on soldDate when status indicates done
  const archived = customers.filter(c => ["Complete", "Invoiced"].includes(c.status));
  const byYear = archived.reduce((map, c) => {
    const yr = (c.soldDate ? new Date(c.soldDate) : new Date()).getFullYear();
    map[yr] = map[yr] || [];
    map[yr].push(c);
    return map;
  }, {});
  const years = Object.keys(byYear).map(n => Number(n)).sort((a,b)=>b-a);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Archive</h1>
      {years.length === 0 ? (
        <div className="text-sm text-gray-500">No archived items yet.</div>
      ) : (
        years.map(yr => (
          <Card key={yr} title={`Year ${yr}`} darkMode={darkMode}>
            <table className="min-w-full text-sm">
              <thead>
                <tr className={darkMode ? "text-left text-gray-300" : "text-left text-gray-600"}>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Sold Date</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {byYear[yr].map((c) => (
                  <tr key={c.id} className={darkMode ? "border-t bg-black text-white" : "border-t bg-white text-black"}>
                    <td className="py-2 pr-4">{c.first} {c.last}</td>
                    <td className="py-2 pr-4">{c.address}, {c.town} {c.zip}</td>
                    <td className="py-2 pr-4">{c.soldDate || ""}</td>
                    <td className="py-2 pr-4">{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  );
}

function Prospects({ customers, onNameClick, onStatusChange, darkMode }) {
  const prospects = customers.filter((c) => c.status === "Prospect");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Prospects</h1>
      <Card title="Prospect Customers" darkMode={darkMode}>
        <CustomerTable customers={prospects} onNameClick={onNameClick} onStatusChange={onStatusChange} darkMode={darkMode} />
      </Card>
    </div>
  );
}

function Jobs({ customers, onNameClick, onStatusChange, darkMode }) {
  const jobs = customers
    .filter((c) => ["Approved", "Complete"].includes(c.status))
    .sort((a, b) => new Date(a.soldDate || 0) - new Date(b.soldDate || 0)); // Fix: Use 0 as fallback

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Jobs (Sold)</h1>
      <Card title="Sold Jobs" darkMode={darkMode}>
        <CustomerTable customers={jobs} onNameClick={onNameClick} onStatusChange={onStatusChange} darkMode={darkMode} />
      </Card>
    </div>
  );
}

/* ---- Calendar ---- */
function Calendar({ darkMode }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [appointments, setAppointments] = useState([
    { id: 1, date: "2025-08-21", time: "09:00", type: "Roof Inspection", customer: "Marybeth Magnuson" },
    { id: 2, date: "2025-08-22", time: "14:30", type: "Repair", customer: "Eileen Carlton" },
  ]);
  const [draggedAppointment, setDraggedAppointment] = useState(null);
  const [showDayView, setShowDayView] = useState(null);
  const [pendingDropDate, setPendingDropDate] = useState(null);
  const [hoveredDay, setHoveredDay] = useState(null);

  // Helpers
  function getMonthDays(date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }
  function getFirstWeekday(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  }
  const timeSlots = Array.from({ length: 24 }, (_, i) => {
    const hour24 = 7 + Math.floor(i / 2); // 7:00 to 18:30
    const min = i % 2 === 0 ? "00" : "30";
    const hour12 = ((hour24 - 1) % 12) + 1;
    const ampm = hour24 < 12 ? "AM" : "PM";
    return `${hour12}:${min} ${ampm}`;
  });

  // Calendar grid logic
  const days = getMonthDays(currentMonth);
  const firstWeekday = getFirstWeekday(currentMonth);
  const weeks = [];
  let week = [];
  for (let i = 0; i < firstWeekday; i++) week.push(null);
  days.forEach((d) => {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  });
  if (week.length) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  // Month navigation
  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  }

  // Month view: appointments only, no times
  if (!showDayView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <div className="flex gap-2">
            <button
              className="border rounded px-3 py-1 text-sm bg-black text-white border-sky-400"
              onClick={() => setCurrentMonth(new Date())}
            >
              Today
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2">
          <button
            className="border rounded px-2 py-1 text-sm bg-black text-white border-sky-400"
            onClick={prevMonth}
          >
            ←
          </button>
          <div className="font-semibold text-lg">
            {currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button
            className="border rounded px-2 py-1 text-sm bg-black text-white border-sky-400"
            onClick={nextMonth}
          >
            →
          </button>
        </div>
        {/* Month grid, small boxes, appointments only */}
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-0 border-t border-sky-400" style={{ minWidth: 700 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className={`py-1 text-center font-semibold border-b border-sky-400 text-xs ${darkMode ? "bg-black text-white" : "bg-white text-black"}`}>{day}</div>
            ))}
            {weeks.map((week, wi) =>
              week.map((d, di) => {
                const dayStr = d
                  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                  : "";
                const dayAppointments = appointments.filter(a => a.date === dayStr);
                const isHovered = hoveredDay === dayStr;
                return (
                  <div
                    key={wi + "-" + di}
                    className={`border-b border-r border-sky-400 align-top relative px-1 py-1
                      ${darkMode ? "bg-black" : "bg-white"}
                      ${isHovered && draggedAppointment ? "ring-2 ring-sky-400 z-10" : ""}
                    `}
                    style={{ minWidth: 90, height: 90, verticalAlign: "top", transition: "box-shadow 0.1s" }}
                    onDragOver={e => {
                      e.preventDefault();
                      if (draggedAppointment && dayStr) setHoveredDay(dayStr);
                    }}
                    onDragLeave={e => {
                      if (draggedAppointment) setHoveredDay(null);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedAppointment && dayStr) {
                        setPendingDropDate(dayStr);
                        setShowDayView(dayStr);
                        setHoveredDay(null);
                      }
                    }}
                    onClick={() => {
                      if (d) {
                        // Always use local date string for selection
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, "0");
                        const day = String(d.getDate()).padStart(2, "0");
                        const dayStr = `${year}-${month}-${day}`;
                        setShowDayView(dayStr);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold">{d ? d.getDate() : ""}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {dayAppointments.map(app => (
                        <div
                          key={app.id}
                          draggable
                          onDragStart={() => setDraggedAppointment(app)}
                          className={`cursor-move px-1 py-0.5 rounded text-[11px] font-semibold text-left truncate ${darkMode ? "bg-blue-900 text-white" : "bg-blue-100 text-blue-900"}`}
                          style={{ lineHeight: "1.3" }}
                        >
                          {app.type} — {app.customer}
                        </div>
                      ))}
                    </div>
                    {draggedAppointment && (
                      <div className="absolute bottom-1 left-1 text-[10px] text-sky-400 opacity-70 pointer-events-none">Drop to select time</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // Day view: show all time slots for selected day, allow user to select a slot for dragged appointment
  const dayAppointments = appointments.filter(a => a.date === showDayView);

  function handleTimeSlotClick(slotTime) {
    if (!draggedAppointment) return;
    setAppointments(apps =>
      apps.map(app =>
        app.id === draggedAppointment.id
          ? { ...app, date: pendingDropDate || showDayView, time: slotTime }
          : app
      )
    );
    setDraggedAppointment(null);
    setShowDayView(null);
    setPendingDropDate(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Select Time Slot</h1>
        <button
          className="border rounded px-3 py-1 text-sm bg-black text-white border-sky-400"
          onClick={() => {
            setShowDayView(null);
            setDraggedAppointment(null);
          }}
        >
          Back to Month
        </button>
      </div>
      <div className="font-semibold text-lg mb-2">
        {new Date(showDayView).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>
      <div className="border rounded-xl p-4 bg-gray-50 dark:bg-black" style={{ maxWidth: 400 }}>
        <div className="flex flex-col gap-0">
          {timeSlots.map(slotTime => {
            const app = dayAppointments.find(a => a.time === slotTime);
            return (
              <div
                key={slotTime}
                className={`h-7 border-b border-gray-200 flex items-center px-2 relative group ${draggedAppointment && !app ? "hover:bg-sky-100 cursor-pointer" : ""}`}
                style={{ transition: "background 0.1s" }}
                onClick={() => draggedAppointment && !app && handleTimeSlotClick(slotTime)}
              >
                <span className="text-[11px] text-gray-400 mr-2 group-hover:text-sky-400" style={{ minWidth: 38 }}>
                  {slotTime}
                </span>
                {app ? (
                  <div
                    className={`px-2 py-0.5 rounded text-xs font-semibold w-full text-left truncate ${darkMode ? "bg-blue-900 text-white" : "bg-blue-100 text-blue-900"}`}
                    style={{ lineHeight: "1.5", height: "100%" }}
                  >
                    {app.type} — {app.customer}
                  </div>
                ) : draggedAppointment ? (
                  <span className="absolute left-12 text-xs text-sky-400">Click to assign here</span>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* List all appointments for the day at the bottom */}
        <div className="mt-4">
          <div className="font-semibold text-xs mb-1">Appointments for this day:</div>
          <ul className="space-y-1">
            {dayAppointments.map(app => (
              <li key={app.id} className="text-xs bg-blue-50 rounded px-2 py-1 flex justify-between items-center">
                <span>{app.time} — {app.type} — {app.customer}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---- Communication ---- */
function Communication({ darkMode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Communication</h1>
      <Card title="Emails" darkMode={darkMode}>
        <ul className="space-y-2 text-sm">
          <li>
            <div className="font-medium text-gray-800">Incoming: "Schedule confirmation"</div>
            <div className="text-xs text-gray-500">From: marybeth@example.com • Aug 17, 2025</div>
            <div className="text-gray-700">Hi, just confirming the drop-off for tomorrow...</div>
          </li>
          <li>
            <div className="font-medium text-gray-800">Outgoing: "Contract sent"</div>
            <div className="text-xs text-gray-500">To: russ@example.com • Aug 16, 2025</div>
            <div className="text-gray-700">Hi Russ, attached is your contract for review...</div>
          </li>
        </ul>
      </Card>
    </div>
  );
}

/* ---- Dashboard ---- */
function Dashboard({ customers, darkMode }) {
  // Example week snapshot data
  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i);
    return d;
  });

  const appointments = [
    { date: weekDays[1].toISOString().slice(0,10), time: "9:00 AM", who: "Marybeth Magnuson", note: "Drop-off confirmation" },
    { date: weekDays[4].toISOString().slice(0,10), time: "2:30 PM", who: "Eileen Carlton", note: "Siding fixes call" },
  ];
  const installs = [
    { date: weekDays[2].toISOString().slice(0,10), address: "3 Curtis Ln, Dennis", crew: "Edwin team", note: "PVC boots 4x4 posts" },
  ];

  // Example unanswered emails
  const unansweredEmails = [
    {
      from: "marybeth@example.com",
      subject: "Schedule confirmation",
      date: "Aug 17, 2025",
      body: "Hi, just confirming the drop-off for tomorrow...",
    },
    {
      from: "patrick@example.com",
      subject: "Roof leak follow-up",
      date: "Aug 18, 2025",
      body: "Can you confirm when the crew will be here?",
    },
  ];

  // Gather all tasks from all customers
  const allTasks = customers.flatMap(c =>
    (c.tasks || []).map((task, idx) => ({
      customer: `${c.first} ${c.last}`,
      task,
      id: `${c.id}-${idx}`,
    }))
  );

  return (
    <div className="space-y-4">
      <h1 className={`text-2xl font-semibold ${darkMode ? "text-white" : "text-black"}`}>Dashboard</h1>
      <Card title="Week Snapshot" darkMode={darkMode}>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const dateStr = d.toISOString().slice(0,10);
            const dayAppointments = appointments.filter(a => a.date === dateStr);
            const dayInstalls = installs.filter(i => i.date === dateStr);
            return (
              <div
                key={dateStr}
                className={`border-2 border-sky-400 rounded p-2 min-h-[80px] ${
                  darkMode ? "bg-black text-white" : "bg-white text-black"
                }`}
              >
                <div className={`font-semibold text-xs ${darkMode ? "text-sky-400" : "text-sky-600"}`}>
                  {d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                {dayAppointments.map((a, i) => (
                  <div key={i} className={`text-xs mt-1 ${darkMode ? "text-sky-400" : "text-sky-600"}`}>{a.time} — {a.who}</div>
                ))}
                {dayInstalls.map((j, i) => (
                  <div key={i} className={`text-xs mt-1 ${darkMode ? "text-sky-400" : "text-sky-600"}`}>{j.address}</div>
                ))}
                {dayAppointments.length === 0 && dayInstalls.length === 0 && (
                  <div className={`text-xs mt-1 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>No events</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="All Customer Tasks" darkMode={darkMode}>
        {allTasks.length === 0 ? (
          <div className="text-sm text-gray-500">No tasks for any customers.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {allTasks.map(taskObj => (
              <li key={taskObj.id} className="border-b pb-2">
                <span className="font-semibold">{taskObj.customer}:</span> {taskObj.task}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Unanswered Emails" darkMode={darkMode}>
        <ul className="space-y-2 text-sm">
          {unansweredEmails.map((email, idx) => (
            <li key={idx} className="border-b pb-2">
              <div className="font-medium text-gray-800">From: {email.from}</div>
              <div className="text-xs text-gray-500">{email.date}</div>
              <div className="text-gray-700">{email.body}</div>
              <span className="text-xs text-red-600">Not responded</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Welcome" darkMode={darkMode}>
        <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
          This is your CRM dashboard. Use the sidebar to navigate.
        </p>
      </Card>
    </div>
  );
}

/* ---- Root Layout ---- */
export default function Crm() {
  const [tab, setTab] = useState("dashboard");
  const [customers, setCustomers] = useState(initialCustomers);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [googleToken, setGoogleToken] = useState(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [darkMode, setDarkMode] = useState(true); // NEW

  // Add document to customer
  const handleAddDocument = (customerId, docName) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, documents: [...c.documents, docName] }
          : c
      )
    );
  };

  // Add photo to customer
  const handleAddPhoto = (customerId, photoUrl) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, photos: [...c.photos, photoUrl] }
          : c
      )
    );
  };

  // Show profile drawer/card in all sections
  const handleNameClick = (customer) => {
    setActiveCustomer(customer);
    setFullScreen(false);
  };

  // Add Lead handler
  const handleAddLead = () => {
    setShowLeadForm(true);
  };

  // Save new lead from form
  const handleSaveLead = async (form) => {
    const newId = customers.length ? Math.max(...customers.map(c => c.id)) + 1 : 1;
    const newLead = {
      id: newId,
      ...form,
      status: "Lead",
      roofColor: "",
      roofSquares: "",
      sidingSquares: "",
      documents: [],
      photos: [],
      notes: [],
      tasks: [],
      communication: [],
    };
    setCustomers([...customers, newLead]);
    setTab("leads");
    setShowLeadForm(false);

    // Create Google Contact if logged in
    if (googleToken) {
      try {
        await fetch('https://people.googleapis.com/v1/people:createContact', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            names: [{ givenName: newLead.first, familyName: newLead.last }],
            addresses: [{ streetAddress: newLead.address, city: newLead.town, postalCode: newLead.zip }],
            emailAddresses: [{ value: newLead.email }],
          }),
        });
        console.log('Google Contact created!');
      } catch (err) {
        console.error('Failed to create Google Contact:', err);
      }
    }
  };

  // Edit customer handler
  const handleEditCustomer = (editData) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === activeCustomer.id
          ? {
              ...c,
              phoneNumbers: editData.phoneNumbers,
              emails: editData.emails,
              contacts: editData.contacts,
            }
          : c
      )
    );
    setShowEditModal(false);
  };

  // Delete customer handler
  const handleDeleteCustomer = (customerId) => {
    setCustomers(customers => customers.filter(c => c.id !== customerId));
    setActiveCustomer(null);
    setShowEditModal(false);
  };

  // Status change handler
  const handleStatusChange = (customerId, newStatus) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, status: newStatus }
          : c
      )
    );
  };

  // Add note to customer
  const handleAddNote = (customerId, noteText) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, notes: [...(c.notes || []), noteText] }
          : c
      )
    );
  };

  // Add task to customer
  const handleAddTask = (customerId, taskText) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, tasks: [...(c.tasks || []), taskText] }
          : c
      )
    );
  };

  // Add communication to customer
  const handleAddCommunication = (customerId, commText) => {
    setCustomers(customers =>
      customers.map(c =>
        c.id === customerId
          ? { ...c, communication: [...(c.communication || []), commText] }
          : c
      )
    );
  };

  // Add this helper for decoding JWT (to get user's name/email)
  function parseJwt(token) {
    if (!token) return {};
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  }

  // Get user info from token
  const userInfo = parseJwt(googleToken);

  // Fetch customer emails and update communication
  async function fetchCustomerEmails(googleToken, customers, setCustomers) {
    if (!googleToken) return;

    // Get list of messages (latest 10)
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:inbox&maxResults=10', {
      headers: { Authorization: `Bearer ${googleToken}` }
    });
    const data = await res.json();
    if (!data.messages) return;

    for (const msg of data.messages) {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });
      const msgData = await msgRes.json();
      const headers = msgData.payload.headers;
      const fromHeader = headers.find(h => h.name === "From");
      const subjectHeader = headers.find(h => h.name === "Subject");
      const dateHeader = headers.find(h => h.name === "Date");
      const body = msgData.snippet;

      // Extract sender email
      const senderMatch = fromHeader?.value.match(/<(.+?)>/);
      const senderEmail = senderMatch ? senderMatch[1] : fromHeader?.value;

      // Find customer by email
      const customerIdx = customers.findIndex(c => c.email === senderEmail);
      if (customerIdx !== -1) {
        // Add to communication if not already present
        setCustomers(customers => {
          const commText = `Email: ${subjectHeader?.value || ""} (${dateHeader?.value || ""}) - ${body}`;
          const alreadyExists = customers[customerIdx].communication?.some(c => c.includes(body));
          if (alreadyExists) return customers;
          const updated = [...customers];
          updated[customerIdx] = {
            ...updated[customerIdx],
            communication: [...(updated[customerIdx].communication || []), commText]
          };
          return updated;
        });
      }
    }
  }

  useEffect(() => {
    // Fetch emails on mount if logged in
    if (googleToken) {
      fetchCustomerEmails(googleToken, customers, setCustomers);
    }
  }, [googleToken]);

  // Add dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("bg-black", "text-white");
    } else {
      document.body.classList.remove("bg-black", "text-white");
    }
    return () => {
      document.body.classList.remove("bg-black", "text-white");
    };
  }, [darkMode]);

  // Fix: Use correct handler names for Prospects and Jobs tabs
  return (
    <GoogleOAuthProvider clientId="665880470238-9c5065mmdi2gdeqvj3nt29epseck5tll.apps.googleusercontent.com">
      <div className={`${darkMode ? "bg-black text-white" : "bg-white text-black"} min-h-screen grid grid-cols-[220px_1fr]`}>
        {/* Sidebar */}
        <aside className={`${darkMode ? "bg-black" : "bg-white"} border-r-2 border-sky-400`}>
          <div className="px-4 py-4 text-lg font-semibold">HyTech CRM</div>
          <nav className="px-2 space-y-1">
            <SidebarButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} darkMode={darkMode}>Dashboard</SidebarButton>
            <SidebarButton active={tab === "calendar"} onClick={() => setTab("calendar")} darkMode={darkMode}>Calendar</SidebarButton>
            <SidebarButton active={tab === "customers"} onClick={() => setTab("customers")} darkMode={darkMode}>Customers</SidebarButton>
            <SidebarButton active={tab === "leads"} onClick={() => setTab("leads")} darkMode={darkMode}>Pipeline</SidebarButton>
            <SidebarButton active={tab === "prospects"} onClick={() => setTab("prospects")} darkMode={darkMode}>Prospects</SidebarButton>
            <SidebarButton active={tab === "jobs"} onClick={() => setTab("jobs")} darkMode={darkMode}>Jobs</SidebarButton>
            <SidebarButton active={tab === "communication"} onClick={() => setTab("communication")} darkMode={darkMode}>Communication</SidebarButton>
            <SidebarButton active={tab === "archive"} onClick={() => setTab("archive")} darkMode={darkMode}>Archive</SidebarButton>
          </nav>
        </aside>

        {/* Main */}
        <div className={`${darkMode ? "bg-black" : "bg-white"} relative`}>
          <header className="h-48 border-b-2 border-sky-400 flex items-center justify-center px-4 relative">
            <img
              src="/LOGO-2017-edit-GOOD.png"
              alt="HyTech Logo"
              className="h-40 w-auto mx-auto"
              style={{ display: "block" }}
            />
            {/* Top right controls */}
            <div className="absolute top-6 right-8 flex items-center gap-3">
              {/* Night mode toggle */}
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center border ${darkMode ? "bg-black text-white" : "bg-gray-100 text-black"} transition`}
                title={darkMode ? "Turn off night mode" : "Turn on night mode"}
                onClick={() => setDarkMode(!darkMode)}
              >
                {darkMode ? (
                  // Moon icon
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" fill="currentColor"/>
                  </svg>
                ) : (
                  // Sun icon
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="5" fill="currentColor"/>
                    <g stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="1" x2="12" y2="4"/>
                      <line x1="12" y1="20" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
                      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="4" y2="12"/>
                      <line x1="20" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
                      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
                    </g>
                  </svg>
                )}
              </button>
              {/* Profile icon */}
              {googleToken && (
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600"
                  title={userInfo?.email || "Google User"}
                >
                  <svg width="20" height="20" fill="white" viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 16-4 16 0" />
                  </svg>
                </div>
              )}
              {/* Google login/logout */}
              {!googleToken ? (
                <GoogleLogin
                  onSuccess={credentialResponse => setGoogleToken(credentialResponse.credential)}
                  onError={() => alert("Google login failed")}
                  theme={darkMode ? "filled_black" : "outline"}
                  size="medium"
                />
              ) : (
                <button
                  className="border rounded px-3 py-1 bg-blue-600 text-white text-xs"
                  onClick={() => setGoogleToken(null)}
                  title="Logout"
                >
                  Logout
                </button>
              )}
            </div>
          </header>
          <main className="p-4">
            {showLeadForm && (
              <LeadForm
                onSave={handleSaveLead}
                onCancel={() => setShowLeadForm(false)}
              />
            )}
            {tab === "dashboard" && <Dashboard customers={customers} darkMode={darkMode} />}
            {tab === "calendar" && <Calendar darkMode={darkMode} />}
            {tab === "customers" && (
              <Customers
                customers={customers}
                onNameClick={handleNameClick}
                onStatusChange={onStatusChange}
                darkMode={darkMode}
              />
            )}
            {tab === "leads" && (
              <Leads
                customers={customers}
                onNameClick={handleNameClick}
                onAddLead={handleAddLead}
                onStatusChange={handleStatusChange}
                darkMode={darkMode}
              />
            )}
            {/* FIX: Use handleStatusChange for both Prospects and Jobs */}
            {tab === "prospects" && (
              <Prospects
                customers={customers}
                onNameClick={handleNameClick}
                onStatusChange={onStatusChange}
                darkMode={darkMode}
              />
            )}
            {tab === "jobs" && (
              <Jobs
                customers={customers}
                onNameClick={handleNameClick}
                onStatusChange={onStatusChange}
                darkMode={darkMode}
              />
            )}
            {tab === "communication" && <Communication darkMode={darkMode} />}
            {tab === "archive" && (
              <Archive customers={customers} darkMode={darkMode} />
            )}
            <CustomerProfile
              customer={activeCustomer}
              onClose={() => setActiveCustomer(null)}
              fullScreen={fullScreen}
              setFullScreen={setFullScreen}
              onAddDocument={handleAddDocument}
              onAddPhoto={handleAddPhoto}
              onDelete={handleDeleteCustomer}
              onAddNote={handleAddNote}
              onAddTask={handleAddTask}
              onAddCommunication={handleAddCommunication}
              onEdit={() => setShowEditModal(true)}
              darkMode={darkMode}
            />
            {showEditModal && activeCustomer && (
              <EditCustomerModal
                customer={activeCustomer}
                onSave={handleEditCustomer}
                onCancel={() => setShowEditModal(false)}
                onDelete={handleDeleteCustomer}
              />
            )}
          </main>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}

// Update all usages of <Card .../> to pass darkMode={darkMode}
// Example: <Card title="Profile" darkMode={darkMode}>...</Card>
// Do this for all Card usages in CustomerProfile, Dashboard, Calendar, etc.
